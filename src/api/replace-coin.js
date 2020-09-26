import _get from 'lodash-es/get.js';
import _set from 'lodash-es/set.js';
import {TX_TYPE, normalizeTxType} from 'minterjs-util';
import GetCoinInfo from './get-coin-info.js';
import {validateCoin} from '../utils.js';

/**
 * @param {MinterApiInstance} apiInstance
 * @return {function(TxParams): (Promise<TxParams>)}
 */
export function ReplaceCoinSymbol(apiInstance) {
    const replaceCoinSymbolByPath = ReplaceCoinSymbolByPath(apiInstance);
    /**
     * @param {TxParams} txParams
     * @return {Promise<TxParams>}
     */
    return function replaceCoinSymbol(txParams) {
        const pathList = getTxParamsPathList(txParams);

        return replaceCoinSymbolByPath(txParams, pathList, txParams.chainId);
    };
}

export function ReplaceCoinSymbolByPath(apiInstance) {
    const getCoinInfo = GetCoinInfo(apiInstance);
    /**
     * @param {Object} txParams
     * @param {Array<string>} pathList
     * @param {number} [chainId]
     * @return {Promise<Object>}
     */
    return function replaceCoinSymbolByPath(txParams, pathList, chainId) {
        let promiseList = {};
        pathList.forEach((path) => fillPath(path));

        const promiseArray = Object.values(promiseList);
        return Promise.all(promiseArray).then(() => txParams);

        function fillPath(path) {
            const symbolValue = _get(txParams, path);
            if (isCoinSymbol(symbolValue)) {
                // coinInfo promise may be used by multiple patchers
                if (!promiseList[symbolValue]) {
                    if (isBaseCoin(chainId, symbolValue)) {
                        promiseList[symbolValue] = Promise.resolve(0);
                    } else {
                        promiseList[symbolValue] = getCoinInfo(symbolValue)
                            .then((coinInfo) => coinInfo.id);
                    }
                }
                // append txParams patcher
                promiseList[symbolValue] = promiseList[symbolValue]
                    .then((coinId) => {
                        _set(txParams, path, coinId);
                        return coinId;
                    });
            }
        }
    };
}

/**
 * @param {TxParams} txParams
 * @return {Array<string>}
 */
function getTxParamsPathList(txParams) {
    let pathList = [];
    pathList.push('gasCoin');

    const txType = normalizeTxType(txParams.type);
    if (txType === TX_TYPE.SEND || txType === TX_TYPE.DECLARE_CANDIDACY || txType === TX_TYPE.DELEGATE || txType === TX_TYPE.UNBOND) {
        pathList.push('data.coin');
    } else if (txType === TX_TYPE.SELL || txType === TX_TYPE.SELL_ALL || txType === TX_TYPE.BUY) {
        pathList.push('data.coinToSell');
        pathList.push('data.coinToBuy');
    } else if (txType === TX_TYPE.MULTISEND) {
        txParams.data.list.forEach((item, index) => {
            pathList.push(`data.list[${index}].coin`);
        });
    }

    return pathList;
}


function isBaseCoin(chainId, coinSymbol) {
    chainId = Number(chainId);
    if (chainId === 1 && coinSymbol === 'BIP') {
        return true;
    }
    if (chainId === 2 && coinSymbol === 'MNT') {
        return true;
    }
    return false;
}

/**
 * May be false positive for coin id strings, e.g. '123'
 * @param {string} coin
 * @return {boolean}
 */
function isCoinSymbol(coin) {
    if (typeof coin !== 'string') {
        return false;
    }

    // hex prefixed
    if (coin.slice(0, 2) === '0x') {
        return false;
    }

    try {
        validateCoin(coin.split('-')[0]);
    } catch (error) {
        return false;
    }

    return true;
}
