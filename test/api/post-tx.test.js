import {generateWallet} from 'minterjs-wallet';
import {TX_TYPE} from 'minterjs-util';
import {
    SendTxData,
    MultisendTxData,
    SellTxData,
    BuyTxData,
    DeclareCandidacyTxData,
    EditCandidateTxData,
    DelegateTxData,
    UnbondTxData,
    RedeemCheckTxData,
    SetCandidateOnTxData,
    SetCandidateOffTxData,
    CreateMultisigTxData,
    CreateCoinTxData,
    SellAllTxData,
    issueCheck,
    prepareSignedTx,
} from '~/src';
import {ENV_DATA, minterGate, minterNode} from './variables';
import {NETWORK_MAX_AMOUNT} from '~/src/utils.js';

const newCandidatePublicKeyGate = generateWallet().getPublicKeyString();
const newCandidatePublicKeyNode = generateWallet().getPublicKeyString();

const NOT_EXISTENT_COIN = 'ASD09431XC';

const API_TYPE_LIST = [
    {
        postTx: makePostTx(minterNode),
        privateKey: ENV_DATA.privateKey2,
        address: ENV_DATA.address2,
        customCoin: 'TESTCOIN03',
        newCandidatePublicKey: newCandidatePublicKeyNode,
        toString() {
            return 'node';
        },
    },
    {
        postTx: makePostTx(minterGate),
        privateKey: ENV_DATA.privateKey,
        address: ENV_DATA.address,
        customCoin: ENV_DATA.customCoin,
        newCandidatePublicKey: newCandidatePublicKeyGate,
        toString() {
            return 'gate';
        },
    },
];

function makePostTx(minterApi) {
    return function postTxDecorated(txParams, options) {
        return minterApi.postTx(txParams, {mempoolRetryLimit: 2, ...options});
    };
}

beforeAll(async () => {
    // fill test ENV_DATA with data from the server
    /*
    if (CURRENT_ENV === ENV_TEST_TESTNET) {
        const response = await axios.get(`${ENV_DATA.nodeBaseUrl}make_test_setup?env=bot`);
        const result = response.data.result;
        ENV_DATA = {
            ...ENV_DATA,
            mnemonic: result.mnemonic,
            privateKey: walletFromMnemonic(result.mnemonic).getPrivateKeyString(),
            address: result.address,
            customCoin: result.coin_symbol,
        };
    }
    */

    // ensure custom coin exists
    const coinPromises = API_TYPE_LIST.map((apiType) => {
        const txParams = {
            chainId: 2,
            type: TX_TYPE.CREATE_COIN,
            data: new CreateCoinTxData({
                name: 'testcoin',
                symbol: apiType.customCoin,
                initialAmount: 5000,
                initialReserve: 10000,
                constantReserveRatio: 50,
            }),
            gasCoin: 'MNT',
            payload: 'custom message',
        };
        return apiType.postTx(txParams, {privateKey: apiType.privateKey});
    });

    // @TODO allSettled is not a function
    // try {
    //     await Promise.allSettled(coinPromises);
    // } catch (e) {
    //     console.log(e?.response?.data || e);
    // }
    try {
        await coinPromises[0];
    } catch (e) {
        console.log(e?.response?.data ? {data: e.response.data, e} : e);
    }
    try {
        await coinPromises[1];
    } catch (e) {
        console.log(e?.response?.data ? {data: e.response.data, e} : e);
    }
}, 30000);

// only one tx from given address can exist in mempool
// beforeEach(async () => {
//     await new Promise((resolve) => {
//         setTimeout(resolve, 5000);
//     });
// }, 10000);


describe('PostTx: send', () => {
    const txParamsData = (apiType, data) => ({
        chainId: 2,
        type: TX_TYPE.SEND,
        data: new SendTxData(Object.assign({
            to: apiType.address,
            value: 10,
            coin: 'MNT',
        }, data)),
        gasCoin: 'MNT',
        payload: 'custom message',
    });

    test('should return signed tx', async () => {
        const nonce = await minterGate.getNonce(ENV_DATA.address);
        const txParams = {...txParamsData(API_TYPE_LIST[0]), nonce, gasPrice: 1};
        const tx = prepareSignedTx(txParams, {privateKey: API_TYPE_LIST[0].privateKey});
        console.log(tx.serialize().toString('hex'));
        expect(tx.serialize().toString('hex').length)
            .toBeGreaterThan(0);
    }, 30000);

    test.each(API_TYPE_LIST)('should work %s', (apiType) => {
        expect.assertions(2);
        const txParams = txParamsData(apiType);
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .then(({hash: txHash}) => {
                console.log(txHash);
                // txHash = txHash.replace(/^Mt/);
                expect(txHash).toHaveLength(66);
                expect(txHash.substr(0, 2)).toEqual('Mt');
            })
            .catch((error) => {
                console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
            });
    }, 30000);

    describe('wait', () => {
        // beforeAll(async () => {
        //     await wait(6000);
        // }, 30000);

        test.each(API_TYPE_LIST)('should fail %s', async (apiType) => {
            expect.assertions(1);
            const txParams = txParamsData(apiType, {value: NETWORK_MAX_AMOUNT, coin: NOT_EXISTENT_COIN});
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                    // Coin not exists
                    expect(error.response.data.error.code === 102 || error.response.data.error.tx_result.code === 102).toBe(true);
                });
        }, 70000);
    });
});


describe('PostTx handle low gasPrice', () => {
    const txParamsData = (apiType) => ({
        chainId: 2,
        type: TX_TYPE.SEND,
        data: new SendTxData({
            to: apiType.address,
            value: 10,
            coin: 'MNT',
        }),
        gasCoin: 'MNT',
        gasPrice: 0, // <= low gas
        payload: 'custom message',
    });

    describe.each(API_TYPE_LIST)('should fail when 0 retries | %s', (apiType) => {
        test('should fail with parsable error', () => {
            expect.assertions(1);
            const txParams = txParamsData(apiType);
            return apiType.postTx(txParams, {privateKey: apiType.privateKey, gasRetryLimit: 0})
                .catch((error) => {
                    // console.log(error);
                    // console.log(error.response.data);
                    const errorMessage = error.response.data.error.tx_result?.message || error.response.data.error.message;
                    expect(errorMessage).toMatch(/^Gas price of tx is too low to be included in mempool\. Expected \d+(\.\d+)?$/);
                });
        }, 70000);
    });

    // @TODO enable after MN-482 will be resolved
    test.skip.each(API_TYPE_LIST)('should work with retries | %s', (apiType) => {
        expect.assertions(2);
        const txParams = txParamsData(apiType);
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .then(({hash: txHash}) => {
                // console.log(txHash);
                // txHash = txHash.replace(/^Mt/);
                expect(txHash).toHaveLength(66);
                expect(txHash.substr(0, 2)).toEqual('Mt');
            })
            .catch((error) => {
                console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
            });
    }, 30000);
});


describe('PostTx: multisend', () => {
    const getTxParams = (apiType) => ({
        chainId: 2,
        type: TX_TYPE.MULTISEND,
        data: new MultisendTxData({
            list: [
                {
                    value: 10,
                    coin: 'MNT',
                    to: apiType.address,
                },
                {
                    value: 0.1,
                    coin: 'MNT',
                    to: 'Mxddab6281766ad86497741ff91b6b48fe85012e3c',
                },
            ],
        }),
        gasCoin: 'MNT',
        payload: 'custom message',
    });

    test.each(API_TYPE_LIST)('should work %s', (apiType) => {
        expect.assertions(2);
        const txParams = getTxParams(apiType);
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .then(({hash: txHash}) => {
                console.log(txHash);
                // txHash = txHash.replace(/^Mt/);
                expect(txHash).toHaveLength(66);
                expect(txHash.substr(0, 2)).toEqual('Mt');
            })
            .catch((error) => {
                console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
            });
    }, 30000);

    test.each(API_TYPE_LIST)('should work with 100 items %s', (apiType) => {
        expect.assertions(2);
        const txParamsInstance = getTxParams(apiType);
        let txData = {
            list: new Array(100).fill(0).map(() => ({
                value: Math.random(),
                coin: 'MNT',
                to: apiType.address,
            })),
        };
        const txParams = {
            ...txParamsInstance,
            data: txData,
        };
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .then(({hash: txHash}) => {
                console.log(txHash);
                // txHash = txHash.replace(/^Mt/);
                expect(txHash).toHaveLength(66);
                expect(txHash.substr(0, 2)).toEqual('Mt');
            })
            .catch((error) => {
                console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
            });
    }, 70000);

    test.each(API_TYPE_LIST)('should fail %s', (apiType) => {
        expect.assertions(1);
        const txParamsInstance = getTxParams(apiType);
        // @TODO txParamsInstance.data is not writable (raw not updated)
        let txData = txParamsInstance.data.fields;
        txData.list[0].value = NETWORK_MAX_AMOUNT;
        txData.list[0].coin = NOT_EXISTENT_COIN;
        const txParams = {
            ...txParamsInstance,
            data: txData,
        };
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .catch((error) => {
                console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                // Coin not exists
                expect(error.response.data.error.code === 102 || error.response.data.error.tx_result.code === 102).toBe(true);
            });
    }, 70000);
});


describe('PostTx: sell', () => {
    const txParamsData = (apiType, data) => ({
        chainId: 2,
        type: TX_TYPE.SELL,
        data: new SellTxData(Object.assign({
            coinToSell: 'MNT',
            coinToBuy: apiType.customCoin,
            valueToSell: 1,
        }, data)),
        gasCoin: 'MNT',
        payload: 'custom message',
    });

    test.each(API_TYPE_LIST)('should work %s', (apiType) => {
        expect.assertions(2);
        const txParams = txParamsData(apiType);
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .then(({hash: txHash}) => {
                // console.log(txHash);
                // txHash = txHash.replace(/^Mt/);
                expect(txHash).toHaveLength(66);
                expect(txHash.substr(0, 2)).toEqual('Mt');
            })
            .catch((error) => {
                console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
            });
    }, 30000);

    test.each(API_TYPE_LIST)('should fail %s', (apiType) => {
        expect.assertions(1);
        const txParams = txParamsData(apiType, {valueToSell: NETWORK_MAX_AMOUNT, coinToSell: NOT_EXISTENT_COIN});
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .catch((error) => {
                console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                // Coin not exists
                expect(error.response.data.error.code === 102 || error.response.data.error.tx_result.code === 102).toBe(true);
            });
    }, 70000);
});

// @TODO sellAll
// @TODO create coin


describe('PostTx: buy', () => {
    const txParamsData = (apiType, data) => ({
        chainId: 2,
        type: TX_TYPE.BUY,
        data: new BuyTxData(Object.assign({
            coinToSell: 'MNT',
            coinToBuy: apiType.customCoin,
            valueToBuy: 1,
        }, data)),
        gasCoin: 'MNT',
        payload: 'custom message',
    });

    test.each(API_TYPE_LIST)('should work %s', (apiType) => {
        expect.assertions(2);
        const txParams = txParamsData(apiType);
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .then(({hash: txHash}) => {
                // console.log(txHash);
                // txHash = txHash.replace(/^Mt/);
                expect(txHash).toHaveLength(66);
                expect(txHash.substr(0, 2)).toEqual('Mt');
            })
            .catch((error) => {
                console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
            });
    }, 30000);

    test.each(API_TYPE_LIST)('should fail %s', (apiType) => {
        expect.assertions(1);
        const txParams = txParamsData(apiType, {valueToBuy: NETWORK_MAX_AMOUNT, coinToSell: NOT_EXISTENT_COIN});
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .catch((error) => {
                console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                // Coin not exists
                expect(error.response.data.error.code === 102 || error.response.data.error.tx_result.code === 102).toBe(true);
            });
    }, 70000);
});


describe('validator', () => {
    describe('PostTx: declare candidacy', () => {
        const txParamsData = (apiType, data) => ({
            chainId: 2,
            type: TX_TYPE.DECLARE_CANDIDACY,
            data: new DeclareCandidacyTxData(Object.assign({
                address: apiType.address,
                publicKey: 'Mp0000000000000000000000000000000000000000000000000000000000000000',
                coin: 'MNT',
                stake: 1.211,
                commission: 50,
            }, data)),
            gasCoin: 'MNT',
            payload: 'custom message',
        });

        test.each(API_TYPE_LIST)('should work %s', async (apiType) => {
            expect.assertions(2);
            const txParams = txParamsData(apiType, {publicKey: apiType.newCandidatePublicKey});
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .then(({hash: txHash}) => {
                    console.log(txHash);
                    // txHash = txHash.replace(/^Mt/);
                    expect(txHash).toHaveLength(66);
                    expect(txHash.substr(0, 2)).toEqual('Mt');
                })
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                });
        }, 30000);

        test.each(API_TYPE_LIST)('should fail %s', (apiType) => {
            expect.assertions(1);
            const txParams = txParamsData(apiType, {stake: NETWORK_MAX_AMOUNT});
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                    // Insufficient funds for sender account
                    expect(error.response.data.error.code === 107 || error.response.data.error.tx_result.code === 107).toBe(true);
                });
        }, 70000);
    });


    describe('PostTx: edit candidate', () => {
        const txParamsData = (apiType, data) => ({
            chainId: 2,
            type: TX_TYPE.EDIT_CANDIDATE,
            data: new EditCandidateTxData(Object.assign({
                publicKey: 'Mp0000000000000000000000000000000000000000000000000000000000000000',
                rewardAddress: apiType.address,
                ownerAddress: apiType.address,
            }, data)),
            gasCoin: 'MNT',
            payload: 'custom message',
        });

        test.each(API_TYPE_LIST)('should work %s', async (apiType) => {
            expect.assertions(2);
            const txParams = txParamsData(apiType, {publicKey: apiType.newCandidatePublicKey});
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .then(({hash: txHash}) => {
                    console.log(txHash);
                    // txHash = txHash.replace(/^Mt/);
                    expect(txHash).toHaveLength(66);
                    expect(txHash.substr(0, 2)).toEqual('Mt');
                })
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                });
        }, 30000);

        test.each(API_TYPE_LIST)('should fail %s', (apiType) => {
            expect.assertions(1);
            const txParams = txParamsData(apiType); // empty publicKey specified
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                    // Candidate with such public key not found
                    expect(error.response.data.error.code === 403 || error.response.data.error.tx_result.code === 403).toBe(true);
                });
        }, 70000);
    });


    describe('PostTx: delegate', () => {
        const txParamsData = (apiType, data) => ({
            chainId: 2,
            type: TX_TYPE.DELEGATE,
            data: new DelegateTxData(Object.assign({
                publicKey: 'Mp0000000000000000000000000000000000000000000000000000000000000000',
                coin: 'MNT',
                stake: 10,
            }, data)),
            gasCoin: 'MNT',
            payload: 'custom message',
        });

        test.each(API_TYPE_LIST)('should work %s', (apiType) => {
            expect.assertions(2);
            const txParams = txParamsData(apiType, {publicKey: apiType.newCandidatePublicKey});
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .then(({hash: txHash}) => {
                    // console.log(txHash);
                    // txHash = txHash.replace(/^Mt/);
                    expect(txHash).toHaveLength(66);
                    expect(txHash.substr(0, 2)).toEqual('Mt');
                })
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                });
        }, 30000);

        test.each(API_TYPE_LIST)('should fail %s', (apiType) => {
            expect.assertions(1);
            const txParams = txParamsData(apiType, {stake: NETWORK_MAX_AMOUNT});
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                    // Candidate with such public key not found
                    expect(error.response.data.error.code === 403 || error.response.data.error.tx_result.code === 403).toBe(true);
                });
        }, 70000);
    });


    describe.skip('PostTx: unbond', () => {
        const txParamsData = (apiType, data) => ({
            chainId: 2,
            type: TX_TYPE.UNBOND,
            data: new UnbondTxData(Object.assign({
                publicKey: 'Mp0000000000000000000000000000000000000000000000000000000000000000',
                coin: 'MNT',
                stake: 10,
            }, data)),
            gasCoin: 'MNT',
            payload: 'custom message',
        });


        test.each(API_TYPE_LIST)('should work %s', (apiType) => {
            console.log('unbond from:', apiType.newCandidatePublicKey);
            expect.assertions(2);
            const txParams = txParamsData(apiType, {publicKey: apiType.newCandidatePublicKey});
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .then(({hash: txHash}) => {
                    // console.log(txHash);
                    // txHash = txHash.replace(/^Mt/);
                    expect(txHash).toHaveLength(66);
                    expect(txHash.substr(0, 2)).toEqual('Mt');
                })
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                });
        }, 30000);

        test.each(API_TYPE_LIST)('should fail %s', (apiType) => {
            // expect.assertions(1);
            const txParams = txParamsData(apiType, {stake: NETWORK_MAX_AMOUNT});
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                    // Candidate with such public key not found
                    expect(error.response.data.error.code === 403 || error.response.data.error.tx_result.code === 403).toBe(true);
                });
        }, 70000);
    });


    describe('PostTx: set candidate on', () => {
        const txParamsData = (apiType, data) => ({
            chainId: 2,
            type: TX_TYPE.SET_CANDIDATE_ON,
            data: new SetCandidateOnTxData(Object.assign({
                publicKey: 'Mp0000000000000000000000000000000000000000000000000000000000000000',
            }, data)),
            gasCoin: 'MNT',
            payload: 'custom message',
        });

        test.each(API_TYPE_LIST)('should work %s', (apiType) => {
            expect.assertions(2);
            const txParams = txParamsData(apiType, {publicKey: apiType.newCandidatePublicKey});
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .then(({hash: txHash}) => {
                    // console.log(txHash);
                    // txHash = txHash.replace(/^Mt/);
                    expect(txHash).toHaveLength(66);
                    expect(txHash.substr(0, 2)).toEqual('Mt');
                })
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                });
        }, 30000);

        test.each(API_TYPE_LIST)('should fail %s', (apiType) => {
            expect.assertions(1);
            const txParams = txParamsData(apiType); // empty publicKey specified
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                    // Candidate with such public key not found
                    expect(error.response.data.error.code === 403 || error.response.data.error.tx_result.code === 403).toBe(true);
                });
        }, 70000);
    });


    describe('PostTx: set candidate off', () => {
        const txParamsData = (apiType, data) => ({
            chainId: 2,
            type: TX_TYPE.SET_CANDIDATE_OFF,
            data: new SetCandidateOffTxData(Object.assign({
                publicKey: 'Mp0000000000000000000000000000000000000000000000000000000000000000',
            }, data)),
            gasCoin: 'MNT',
            payload: 'custom message',
        });

        test.each(API_TYPE_LIST)('should work %s', (apiType) => {
            expect.assertions(2);
            const txParams = txParamsData(apiType, {publicKey: apiType.newCandidatePublicKey});
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .then(({hash: txHash}) => {
                    // console.log(txHash);
                    // txHash = txHash.replace(/^Mt/);
                    expect(txHash).toHaveLength(66);
                    expect(txHash.substr(0, 2)).toEqual('Mt');
                })
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                });
        }, 30000);

        test.each(API_TYPE_LIST)('should fail %s', (apiType) => {
            expect.assertions(1);
            const txParams = txParamsData(apiType); // empty publicKey specified
            return apiType.postTx(txParams, {privateKey: apiType.privateKey})
                .then((res) => {
                    console.log({res});
                })
                .catch((error) => {
                    console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                    // Candidate with such public key not found
                    expect(error.response.data.error.code === 403 || error.response.data.error.tx_result.code === 403).toBe(true);
                });
        }, 70000);
    });
});


describe('PostTx: redeem check', () => {
    function getRandomCheck(apiType, gasCoin = 'MNT') {
        return issueCheck({
            privateKey: apiType.privateKey,
            chainId: 2,
            password: '123',
            nonce: 1,
            coinSymbol: 'MNT',
            value: Math.random(),
            gasCoin,
        });
    }

    const txParamsData = (apiType, data, gasCoin) => ({
        chainId: 2,
        type: TX_TYPE.REDEEM_CHECK,
        data: new RedeemCheckTxData(Object.assign({
            check: getRandomCheck(apiType, gasCoin),
            password: '123',
            privateKey: apiType.privateKey,
        }, data)),
    });

    test.each(API_TYPE_LIST)('should work %s', (apiType) => {
        expect.assertions(2);
        const txParams = txParamsData(apiType);
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .then(({hash: txHash}) => {
                // console.log(txHash);
                // txHash = txHash.replace(/^Mt/);
                expect(txHash).toHaveLength(66);
                expect(txHash.substr(0, 2)).toEqual('Mt');
            })
            .catch((error) => {
                console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
            });
    }, 30000);

    test.each(API_TYPE_LIST)('should work with custom coin %s', (apiType) => {
        expect.assertions(2);
        const txParams = txParamsData(apiType, {}, apiType.customCoin);
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .then(({hash: txHash}) => {
                // console.log(txHash);
                // txHash = txHash.replace(/^Mt/);
                expect(txHash).toHaveLength(66);
                expect(txHash.substr(0, 2)).toEqual('Mt');
            })
            .catch((error) => {
                console.log(error);
                console.log(error.response.data);
            });
    }, 30000);

    test.each(API_TYPE_LIST)('should fail %s', (apiType) => {
        expect.assertions(1);
        const txParams = txParamsData(apiType, {check: 'Mcf8a83102808a4d4e5400000000000000888ac7230489e800008a4d4e5400000000000000b841d8236e9908730e8f9c9b6624e77dcbd621ae9a88fd4e442bae8917ac7f8e43361a99df21df47226e971f20f56f78d60364e82986ff694542628f904fbcd215f6011ba0fc9a9d4214b5654cece48c6fbc415f875ca7a95c23bfebe9b4eea8767d5f2adaa071b45d413c74041154aca91b0cf7cb004db20748eccb8feff581b48e331c5b79'});
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .catch((error) => {
                console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                // Check expired
                expect(error.response.data.error.code === 502 || error.response.data.error.tx_result.code === 502).toBe(true);
            });
    }, 70000);
});


describe('PostTx: create multisig', () => {
    const txParamsData = (apiType, data) => ({
        chainId: 2,
        type: TX_TYPE.CREATE_MULTISIG,
        data: new CreateMultisigTxData(Object.assign({
            addresses: [apiType.address, 'Mx7633980c000139dd3bd24a3f54e06474fa941e01'],
            weights: [1, 2],
            threshold: 100,
        }, data)),
        gasCoin: 'MNT',
    });

    test.each(API_TYPE_LIST)('should work %s', (apiType) => {
        expect.assertions(2);
        const txParams = txParamsData(apiType, {
            weights: [Math.random(), Math.random()].map((item) => item.toString().replace(/\D/, '').substr(0, 3)),
        });
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .then(({hash: txHash}) => {
                // console.log(txHash);
                // txHash = txHash.replace(/^Mt/);
                expect(txHash).toHaveLength(66);
                expect(txHash.substr(0, 2)).toEqual('Mt');
            })
            .catch((error) => {
                console.log(error);
                console.log(error.response.data);
            });
    }, 30000);

    // @TODO MN-378
    test.skip.each(API_TYPE_LIST)('should fail %s', (apiType) => {
        expect.assertions(1);
        const txParams = txParamsData(apiType, {threshold: 100000000000000000000});
        return apiType.postTx(txParams, {privateKey: apiType.privateKey})
            .catch((error) => {
                console.log(error?.response?.data ? {data: error.response.data, tx_result: error.response.data.error?.tx_result, error} : error);
                // rlp: input string too long for uint, decoding into (transaction.CreateMultisigData).Threshold
                expect(error.response.data.error.code === 106 || error.response.data.error.tx_result?.code === 106).toBe(true);
            });
    }, 70000);
});

// @TODO test multisig tx
