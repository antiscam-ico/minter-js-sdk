import {ENV_DATA, minterGate, minterNode} from './variables';
import {logError} from '~/test/utils.js';


describe('GetNonce', () => {
    test('should work gate', () => {
        expect.assertions(1);

        return minterGate.getNonce(ENV_DATA.address)
            .then((nonce) => {
                expect(nonce).toBeGreaterThan(0);
            })
            .catch((error) => {
                logError(error);
            });
    }, 30000);

    test('should work node', () => {
        expect.assertions(1);

        return minterNode.getNonce(ENV_DATA.address)
            .then((nonce) => {
                expect(nonce).toBeGreaterThan(0);
            })
            .catch((error) => {
                logError(error);
            });
    }, 30000);
});
