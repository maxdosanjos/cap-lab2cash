const cds = require('@sap/cds');
const { SELECT, UPDATE, INSERT } = require('@sap/cds/lib/ql/cds-ql');

module.exports = (async (srv) =>{

    const db = await cds.connect.to('db');
    const dbe = db.entities;

    const proxyS4 = await cds.connect.to('LAB2CASH_PROXY');
    const s4e = proxyS4.entities;

    /** Helper para buscar Customer com carteira */
    const getCustomerWithWallet = async (bpId) => {
        return await SELECT.one`
        from ${dbe.Customers} {
            *,
            wallet { * }
        }
        where business_partner_id = ${bpId}
        `;
    };

    /** Helper para criar Customer */
  const createCustomer = async (bpId) => {
    await INSERT.into(dbe.Customers).entries({
      business_partner_id: bpId,
      wallet: { balance: 0 }
    });
    console.log(`Customer created: ${bpId}`);
    return getCustomerWithWallet(bpId);
  };


    srv.before('CREATE', 'A_SalesOrder', async(req)=>{

        const { SoldToParty, TotalNetAmount, Order } = req.data;

        const parameters = await SELECT.one().from(dbe.Parameters);
        if (!parameters) return req.error(500, 'System parameters not configured');

        //Esta usando cashback? O cashback está ativo?
        if(Order.applied_cashback > 0 && !parameters.is_cashback_active){
            return req.error(422,'Cashback is not active');
        }        

        //Business partner existe no S/4?
        const bp = await proxyS4.run(
            SELECT.one(s4e.A_BusinessPartner).where({ BusinessPartner: SoldToParty })
        );

        if(!bp){
            return req.error(404,`Business Partner ${ SoldToParty } not found`);
        }

        //Customer existe no HANA Cloud?
        let customer = await getCustomerWithWallet(bp.BusinessPartner);
        if (!customer) customer = await createCustomer(bp.BusinessPartner);
        
        //Esta usando cashback? Tem saldo em carteira? //JS: Nullish coalescing operator
        if (Order.applied_cashback > (customer.wallet?.balance ?? 0)) {
            return req.error(422,`Applied cashback is greater than customer wallet balance`);
        }

        //Esta usando cashback? o cashback excede o limite de resgate?
        const allowedRedemptionLimit = TotalNetAmount * parameters.cashback_redemption_limit;
        if(Order.applied_cashback > allowedRedemptionLimit){
            return req.error(422,`Cashback redemption limit exceed`);
        }

    });

    srv.on('CREATE', 'A_SalesOrder', async (req)=>{
        //Fazer os selects
        const{ 
            SalesOrderType,
            PurchaseOrderByCustomer,
            SoldToParty,
            TotalNetAmount,
            to_Item,
            Order
        } = req.data;

        const customer = await SELECT.one`from ${dbe.Customers} {
                *, 
                wallet{
                    *
                }
            } where business_partner_id = ${ SoldToParty }`;

        const orderAmountInCents = ( TotalNetAmount * 100 ) - Order.applied_cashback;

        const parameters = await SELECT.one(dbe.Parameters);
        if (!parameters) return req.error(500, 'System parameters not configured');

        const receveidCashback = orderAmountInCents * ( parameters.cashback_return / 100 );

        //Criar Sales Order no S/4
        const salesOrder = await proxyS4.run(
            INSERT({
                SalesOrderType,
                PurchaseOrderByCustomer,
                SoldToParty,
                TotalNetAmount,
                to_Item
            }).into(s4e.A_SalesOrder)
        );

        //Criar transaction
        const transactions = [];
        if(Order.applied_cashback > 0){
            transactions.push({
                type: "REDEMPTION",
                amount: Order.applied_cashback,
                wallet: {
                    ID: customer.wallet.ID
                }
            });
        }

        if(receveidCashback > 0){
            transactions.push({
                type: "CREDIT",
                amount: receveidCashback,
                wallet: {
                    ID: customer.wallet.ID
                }
            });
        }

        console.log(transactions);

        //Criar ordem no CAP
        const orderRes = await INSERT({
            sales_order_id: salesOrder.SalesOrder,
            applied_cashback: Order.applied_cashback,
            amount: orderAmountInCents,
            customer_ID: customer.ID,
            transactions
        }).into(dbe.Orders);

        console.log(`Order crated: ${orderRes}`);

        //Atualizar saldo da carteira
        const transactionsAmount = transactions.reduce((accumulator,current)=>{

            const value = current.type === 'REDEMPTION'
                ? accumulator - current.amount
                : accumulator + current.amount;

                return value;
        }, 0);

        const updatedBalance = (customer?.wallet?.balance ? customer.wallet.balance : 0 ) + transactionsAmount;

        const walletRes = await UPDATE(dbe.Wallets).set({
            balance: updatedBalance
        }).where({
            ID : customer.wallet.ID
        });
        console.log(`Balance updated: ${(updatedBalance / 100).toFixed(2)}`);

        await srv.emit('balanceUpdated', { wallet_ID: customer.wallet.ID });

        return salesOrder;        

    });

    srv.on('balanceUpdated', async (req)=> {
        
        const {wallet_ID} = req.data;
        
        await SELECT.one(dbe.Wallets).where({ID : wallet_ID});

    });

    srv.on('READ', 'A_BusinessPartner', (req)=> proxyS4.run(req.query));

    srv.on('READ', 'A_SalesOrder', (req)=> proxyS4.run(req.query));

    srv.on('READ', 'A_Product', (req)=> proxyS4.run(req.query));

    srv.on('getParameters', async (req) => {

        const parameters = await SELECT.one.from(dbe.Parameters);

        return parameters;
    });

    srv.on('updateParameters', async (req) => {

        //JS destructuring
        const { parameters } = req.data;
        
        const result = await UPDATE(dbe.Parameters).set(parameters);

        console.log(result);
        
        return parameters;
    });

});