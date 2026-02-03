import * as bip39 from 'bip39';
import CryptoJS from 'crypto-js';

export const generateSeedPhrase = () => {
  return bip39.generateMnemonic(256);
};

export const validateSeedPhrase = (mnemonic) => {
  return bip39.validateMnemonic(mnemonic);
};

export const deriveKey = (mnemonic) => {
  // Use PBKDF2 to derive a key from the mnemonic
  const salt = "synclip-salt"; // In a real app, this might be fixed or shared
  return CryptoJS.PBKDF2(mnemonic, salt, {
    keySize: 256 / 32,
    iterations: 1000
  }).toString();
};

export const encryptData = (data, key) => {
  return CryptoJS.AES.encrypt(data, key).toString();
};

export const decryptData = (ciphertext, key) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, key);
  return bytes.toString(CryptoJS.enc.Utf8);
};

export const getRoomId = (mnemonic) => {
  return CryptoJS.SHA256(mnemonic).toString();
};
