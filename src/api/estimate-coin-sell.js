import {stringify as qsStringify} from 'qs';
import {convertFromPip, convertToPip} from 'minterjs-util';
// import {convertFromPip, convertToPip} from 'minterjs-util/src/converter.js';
import {isValidNumber, isCoinId} from '../utils.js';

/**
 * @typedef {Object} EstimateSellResult
 * @property {number|string} will_get - amount of coinToBuy
 * @property {number|string} commission - amount of coinToSell to pay fee
 * @property {"pool"|"bancor"} swap_from
 */

/**
 * @param {MinterApiInstance} apiInstance
 * @return {function({coinIdToSell?: (number|string), coinToSell?: string, valueToSell?: (string|number), coinIdToBuy?: (number|string), coinToBuy?: string, swapFrom?: ESTIMATE_SWAP_TYPE, route?: Array<string|number>, gasCoin?: (string|number), coinCommission?: (string|number)}, axiosOptions: AxiosRequestConfig=): Promise<EstimateSellResult>}
 */
export default function EstimateCoinSell(apiInstance) {
    return estimateCoinSell;
    /**
     * Get nonce for new transaction: last transaction number + 1
     * @param {Object} params
     * @param {string|number} [params.coinToSell] - ID or symbol of the coin to sell
     * @param {string|number} [params.valueToSell]
     * @param {string|number} [params.coinToBuy] - ID or symbol of the coin to buy
     * @param {ESTIMATE_SWAP_TYPE} [params.swapFrom] - estimate pool swap
     * @param {Array<string|number>} [params.route] - intermediate coins IDs
     * @param {string|number} [params.gasCoin]
     * @param {string|number} [params.coinCommission] - gasCoin alias
     * @param {AxiosRequestConfig} [axiosOptions]
     * @return {Promise<EstimateSellResult>}
     */
    function estimateCoinSell(params, axiosOptions) {
        if (params.coinIdToSell || params.coinIdToSell === 0) {
            params.coinToSell = params.coinIdToSell;
            console.warn('coinIdToSell is deprecated, use coinToSell instead');
        }
        if (params.coinIdToBuy || params.coinIdToBuy === 0) {
            params.coinToBuy = params.coinIdToBuy;
            console.warn('coinIdToSell is deprecated, use coinToSell instead');
        }

        if (!params.coinToBuy && params.coinToBuy !== 0) {
            return Promise.reject(new Error('Coin to buy not specified'));
        }
        if (!params.valueToSell) {
            return Promise.reject(new Error('Value to sell not specified'));
        }
        if (!params.coinToSell && params.coinToSell !== 0) {
            return Promise.reject(new Error('Coin to sell not specified'));
        }

        const gasCoin = (params.gasCoin || params.gasCoin === 0) ? params.gasCoin : params.coinCommission;

        params = {
            coin_id_to_sell: isCoinId(params.coinToSell) ? params.coinToSell : undefined,
            coin_to_sell: !isCoinId(params.coinToSell) ? params.coinToSell : undefined,
            value_to_sell: convertToPip(params.valueToSell),
            coin_id_to_buy: isCoinId(params.coinToBuy) ? params.coinToBuy : undefined,
            coin_to_buy: !isCoinId(params.coinToBuy) ? params.coinToBuy : undefined,
            swap_from: params.swapFrom,
            route: params.route,
            coin_id_commission: isCoinId(gasCoin) ? gasCoin : undefined,
            coin_commission: !isCoinId(gasCoin) ? gasCoin : undefined,
        };

        return apiInstance.get('estimate_coin_sell', {
            ...axiosOptions,
            params,
            paramsSerializer: (query) => qsStringify(query, {arrayFormat: 'repeat'}),
        })
            .then((response) => {
                const resData = response.data;
                if (!isValidNumber(resData.will_get)) {
                    throw new Error('Invalid estimation data, `will_get` not specified');
                }
                if (!isValidNumber(resData.commission)) {
                    throw new Error('Invalid estimation data, `commission` not specified');
                }

                return {
                    ...resData,
                    // receive pips from node and convert them
                    will_get: convertFromPip(resData.will_get),
                    commission: convertFromPip(resData.commission),
                };
            });
    }
}
