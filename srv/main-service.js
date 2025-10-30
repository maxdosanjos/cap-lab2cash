const cds = require('@sap/cds')

module.exports = (async (srv) =>{

    const proxyS4 = await cds.connect.to('LAB2CASH_PROXY')

    srv.on('READ', 'A_BusinessPartner', (req)=> proxyS4.run(req.query));

});