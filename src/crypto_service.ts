import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfig, type CryptoConfig } from './config';

export class CryptoService {
    private config: CryptoConfig | null = null;
    private privateKey: crypto.KeyObject | null = null;
    private publicKey: crypto.KeyObject | null = null;

    constructor() {
        this.init();
    }

    private init() {
        const fullConfig = getConfig();
        if (fullConfig.global.crypto) {
            this.config = fullConfig.global.crypto;

            if (this.config.mode === 'asymmetric') {
                this.loadOrGenerateKeys();
            }
        }
    }

    private loadOrGenerateKeys() {
        if (!this.config?.keyDir) return;

        const keyDirPath = path.resolve(process.cwd(), this.config.keyDir);
        if (!fs.existsSync(keyDirPath)) {
            fs.mkdirSync(keyDirPath, { recursive: true });
        }

        const privPath = path.join(keyDirPath, 'private.pem');
        const pubPath = path.join(keyDirPath, 'public.pem');

        if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
            console.log('[CryptoService] Loading existing asymmetric keys...');
            this.privateKey = crypto.createPrivateKey(fs.readFileSync(privPath));
            this.publicKey = crypto.createPublicKey(fs.readFileSync(pubPath));
        } else {
            console.log('[CryptoService] Generating new Ed25519 key pair...');
            // We use ed25519 as it's modern, fast, and generates small signatures.
            // Node's native crypto supports it broadly.
            const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

            this.privateKey = privateKey;
            this.publicKey = publicKey;

            fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
            fs.writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }));
            console.log('[CryptoService] Key pair saved to', keyDirPath);
        }
    }

    /**
     * Hashes data based on the configured algorithm.
     */
    public hash(data: string): string {
        const algo = this.config?.hashAlgo || getConfig().global.hashAlgo || 'sha256';
        return crypto.createHash(algo).update(data).digest('hex');
    }

    /**
     * Signs data if the proxy is in asymmetric mode. Returns empty string otherwise.
     */
    public sign(data: string): string {
        if (this.config?.mode !== 'asymmetric' || !this.privateKey) {
            return '';
        }

        // For Ed25519, we technically don't need to specify a hashing algorithm for the sign function 
        // as the algorithm itself natively hashes, but Node.js `crypto.sign` handles this abstraction.
        try {
            const signature = crypto.sign(null, Buffer.from(data), this.privateKey);
            return signature.toString('hex');
        } catch (e) {
            console.error('[CryptoService] Failed to sign data:', e);
            return '';
        }
    }

    /**
     * Verifies a signature against the original data and the public key.
     */
    public verify(data: string, signature: string): boolean {
        if (this.config?.mode !== 'asymmetric' || !this.publicKey || !signature) {
            return false; // Can't verify
        }

        try {
            return crypto.verify(
                null,
                Buffer.from(data),
                this.publicKey,
                Buffer.from(signature, 'hex')
            );
        } catch (e) {
            console.error('[CryptoService] Failed to verify signature:', e);
            return false;
        }
    }
}

// Export a singleton instance
export const cryptoService = new CryptoService();
