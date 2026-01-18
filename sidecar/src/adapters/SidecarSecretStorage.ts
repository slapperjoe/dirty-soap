/**
 * Sidecar Secret Storage
 * 
 * Stores secrets in a local encrypted file.
 * Uses simple AES encryption for demonstration.
 * In production, consider using system keychain.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { ISecretStorage } from '../../../src/interfaces/ISecretStorage';

const ENCRYPTION_KEY_ENV = 'APINOX_SECRET_KEY';
const ALGORITHM = 'aes-256-gcm';

export class SidecarSecretStorage implements ISecretStorage {
    private secretsPath: string;
    private secrets: Record<string, string> = {};
    private encryptionKey: Buffer;

    constructor() {
        const apinoxDir = path.join(os.homedir(), '.apinox');
        this.secretsPath = path.join(apinoxDir, 'secrets.enc');

        // Ensure directory exists
        if (!fs.existsSync(apinoxDir)) {
            fs.mkdirSync(apinoxDir, { recursive: true });
        }

        // Get or generate encryption key
        this.encryptionKey = this.getOrCreateKey();
        this.loadSecrets();
    }

    private getOrCreateKey(): Buffer {
        // Check environment for key
        const envKey = process.env[ENCRYPTION_KEY_ENV];
        if (envKey) {
            return Buffer.from(envKey, 'hex');
        }

        // Check for key file
        const keyPath = path.join(os.homedir(), '.apinox', '.key');
        if (fs.existsSync(keyPath)) {
            return Buffer.from(fs.readFileSync(keyPath, 'utf-8'), 'hex');
        }

        // Generate new key
        const newKey = crypto.randomBytes(32);
        fs.writeFileSync(keyPath, newKey.toString('hex'), { mode: 0o600 });
        return newKey;
    }

    private loadSecrets(): void {
        try {
            if (fs.existsSync(this.secretsPath)) {
                const encrypted = fs.readFileSync(this.secretsPath);
                const iv = encrypted.subarray(0, 16);
                const authTag = encrypted.subarray(16, 32);
                const data = encrypted.subarray(32);

                const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv as any);
                decipher.setAuthTag(authTag as any);

                const decrypted = Buffer.concat([
                    decipher.update(data as any),
                    decipher.final()
                ]);

                this.secrets = JSON.parse(decrypted.toString('utf-8'));
            }
        } catch (error) {
            console.warn('[SidecarSecrets] Failed to load secrets:', error);
            this.secrets = {};
        }
    }

    private saveSecrets(): void {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv as any);

            const data = JSON.stringify(this.secrets);
            const encrypted = Buffer.concat([
                cipher.update(data, 'utf-8'),
                cipher.final()
            ]);
            const authTag = cipher.getAuthTag();

            fs.writeFileSync(
                this.secretsPath,
                Buffer.concat([iv, authTag, encrypted] as any[]),
                { mode: 0o600 }
            );
        } catch (error) {
            console.error('[SidecarSecrets] Failed to save secrets:', error);
        }
    }

    async store(key: string, value: string): Promise<void> {
        this.secrets[key] = value;
        this.saveSecrets();
    }

    async get(key: string): Promise<string | undefined> {
        return this.secrets[key];
    }

    async delete(key: string): Promise<void> {
        delete this.secrets[key];
        this.saveSecrets();
    }
}
