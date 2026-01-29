// Offscreen document script
console.log("Offscreen document loaded");

async function readClipboard() {
  try {
    const textarea = document.createElement('textarea');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    document.execCommand('paste');
    const text = textarea.value;
    document.body.removeChild(textarea);
    return text;
  } catch (err) {
    console.error('Failed to read clipboard: ', err);
    return null;
  }
}

async function writeClipboard(text) {
  try {
    const textarea = document.createElement('textarea');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch (err) {
    console.error('Failed to write clipboard: ', err);
    // Fallback to modern API just in case
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.error('Modern Clipboard API also failed: ', e);
      return false;
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'READ_CLIPBOARD') {
    readClipboard().then(text => sendResponse({ text }));
    return true; // Keep channel open for async response
  } else if (message.type === 'WRITE_CLIPBOARD') {
    writeClipboard(message.text).then(success => sendResponse({ success }));
    return true;
  }
});
