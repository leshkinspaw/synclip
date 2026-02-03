import browser from 'webextension-polyfill';

export const getStorageData = async (keys) => {
  return await browser.storage.local.get(keys);
};

export const setStorageData = async (data) => {
  await browser.storage.local.set(data);
};

export const removeStorageData = async (keys) => {
  await browser.storage.local.remove(keys);
};
