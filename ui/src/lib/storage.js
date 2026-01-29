export const getStorageData = (keys) => {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(keys, (result) => {
        resolve(result);
      });
    } else {
      // Fallback for development in browser
      const result = {};
      const items = Array.isArray(keys) ? keys : [keys];
      items.forEach(key => {
        result[key] = localStorage.getItem(key);
        try {
          result[key] = JSON.parse(result[key]);
        } catch (e) {}
      });
      resolve(result);
    }
  });
};

export const setStorageData = (data) => {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set(data, () => {
        resolve();
      });
    } else {
      // Fallback for development in browser
      Object.entries(data).forEach(([key, value]) => {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      });
      resolve();
    }
  });
};

export const removeStorageData = (keys) => {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.remove(keys, () => {
        resolve();
      });
    } else {
      // Fallback for development in browser
      const items = Array.isArray(keys) ? keys : [keys];
      items.forEach(key => localStorage.removeItem(key));
      resolve();
    }
  });
};
