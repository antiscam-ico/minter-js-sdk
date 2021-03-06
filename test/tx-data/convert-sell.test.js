import {SellTxData} from '~/src';

describe('SellTxData', () => {
    const txParamsData = {
        coinToSell: '0',
        coinToBuy: '1',
        valueToSell: '20',
    };
    const txData = new SellTxData(txParamsData).serialize();

    test('.fromRlp', () => {
        const params = SellTxData.fromRlp(txData).fields;
        delete params.minimumValueToBuy;
        expect(params)
            .toEqual(txParamsData);
    });
});
