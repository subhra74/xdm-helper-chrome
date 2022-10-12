var newURL = 'chrome://extensions/'
chrome.tabs.create({ url: newURL });
chrome.management.uninstallSelf();