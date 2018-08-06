import {Buffer} from 'safe-buffer';
import issueCheck from '../src/check/issue';

describe('.issueCheck()', () => {
    test('should work', () => {
        const check = issueCheck({
            privateKey: '2919c43d5c712cae66f869a524d9523999998d51157dc40ac4d8d80a7602ce02',
            passPhrase: 'pass',
            nonce: 1,
            coinSymbol: 'MNT',
            value: 10,
            dueBlock: 999999,
        });
        expect(check).toEqual('Mcf89f01830f423f8a4d4e5400000000000000888ac7230489e80000b841ada7ad273bef8a1d22f3e314fdfad1e19b90b1fe8dc7eeb30bd1d391e89af8642af029c138c2e379b95d6bc71b26c531ea155d9435e156a3d113a14c912dfebf001ca0781a7b7d781634bcf632579b99d583887ab093dfbd50b65de5c0e5813028a277a071272d8e1be721f5307f40f87daa4ab632781640f18fd424839396442cc7ff17');
    });
});