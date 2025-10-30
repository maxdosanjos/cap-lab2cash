using { LAB2CASH_PROXY } from './external/LAB2CASH_PROXY.cds';

service Main {

    @readyonly
    entity A_BusinessPartner as projection on LAB2CASH_PROXY.A_BusinessPartner;
}