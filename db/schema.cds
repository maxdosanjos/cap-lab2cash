namespace cap.l2l.lab2cash;

using{ cuid, managed } from '@sap/cds/common';

entity Orders : cuid, managed {
    key sales_order_id      : Integer;
    customer                : Association to one Customers;
    applied_cashback        : Integer;
    amount                  : Integer;
    transactions            : Composition of Orders.Transactions on transactions.order = $self;
}

entity Orders.Transactions : cuid {
    orders                  : Association to one Orders;
    wallet                  : Association to one Wallets;
    type                    : String enum { 
            CREDIT; 
            REDEMPTION; 
    }
    amount                   : Integer;
}

entity Customers : cuid{
    wallet                  : Association to one Wallet on wallet.customer = $self;
    orders                  : Association to many Orders on order.customer = $self;
    business_partner_id     : Integer
}

entity Wallets : cuid {
    balance                 : Integer default 0;
    customer                : Association to one Customers;
    transactions            : Composition of many Orders.Transactions on transactions.wallet = $self;
}

entity Parameters {
    is_cashback_active          : Boolean;
    cashback_return             : Decimal;
    cashback_redemption_limit   : Decimal;
}


