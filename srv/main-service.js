const cds = require('@sap/cds');
const { SELECT, UPDATE } = require('@sap/cds/lib/ql/cds-ql');

module.exports = (async (srv) =>{

    const db = await cds.connect.to('db');
    const dbe = db.entities;

    const proxyS4 = await cds.connect.to('LAB2CASH_PROXY')

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