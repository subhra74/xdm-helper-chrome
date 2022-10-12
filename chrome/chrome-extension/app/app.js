"use strict";
import Logger from './logger.js';
import RequestWatcher from './request-watcher.js';

export default class App {
    constructor() {
        this.logger = new Logger();
        this.blockedHosts = [];
        this.fileExts = [];
        this.port = undefined;
        this.activeDownloads = [];
        this.requestWatcher = new RequestWatcher(this.onRequestDataReceived.bind(this));
        this.tabsWatcher = [];
        this.registered = false;
        this.enabled = false;
        this.registerTabOpen = false;
    }

    onRequestDataReceived(data) {
        //Streaming video data received, send to native messaging application
        this.logger.log(data);
        this.port && this.port.postMessage({ download_headers: data });
    }

    onDeterminingFilename(download, suggest) {
        this.logger.log("onDeterminingFilename");
        this.logger.log(download);
        let url = download.finalUrl || download.url;
        this.logger.log(url);
        if (this.enabled && this.shouldTakeOver(url, download.filename)) {
            chrome.downloads.cancel(
                download.id
            );
            this.triggerDownload(url, download.filename,
                download.referrer, download.fileSize, download.mime);
        }
    }

    onDownloadCreated(download) {
        this.logger.log("onDownloadCreated");
        this.logger.log(download);
    }

    onMessage(msg) {
        if (!this.registered) {
            this.registered = true;
            chrome.storage.local.set({ registered: true });
        }
        this.logger.log(msg);
        this.enabled = msg.enabled === true;
        this.fileExts = msg.fileExts;
        this.blockedHosts = msg.blockedHosts;
        this.tabsWatcher = msg.tabsWatcher;
        this.requestWatcher.updateConfig({
            enabled: msg.enabled,
            fileExts: msg.requestFileExts,
            blockedHosts: msg.blockedHosts,
            matchingHosts: msg.matchingHosts,
            mediaTypes: msg.mediaTypes
        });
        this.updateActionIcon();
    }

    onDisconnect(p) {
        this.logger.log("Disconnected.");
        this.logger.log(p);
        this.enabled = false;
        this.port = undefined;
        this.updateActionIcon();
        chrome.storage.local.get(['registered'], this.onRegister.bind(this));
    }

    onRegister(result) {
        if (result && result.registered === true) {
            return;
        }
        if (this.registerTabOpen) {
            return;
        }
        chrome.tabs.create({ url: chrome.runtime.getURL("register.html") });
        this.registerTabOpen = true;
    }

    startNativeHost() {
        this.port = chrome.runtime.connectNative("xdm_chrome.native_host");
        this.port.onMessage.addListener(this.onMessage.bind(this));
        this.port.onDisconnect.addListener(this.onDisconnect.bind(this));
    }

    actionClicked(tab) {
        if (!this.enabled) {
            if (!this.port) {
                this.startNativeHost();
            }
        } else {
            this.diconnect();
        }
    }

    onTabUpdate(tabId, changeInfo, tab) {
        let nativePort = this.port;
        if (changeInfo.title) {
            if (this.tabsWatcher &&
                this.tabsWatcher.find(t => tab.url.indexOf(t) > 0)) {
                this.logger.log("Tab changed: " + changeInfo.title + " => " + tab.url);
                try {
                    nativePort.postMessage({
                        tab_update: {
                            url: tab.url,
                            title: changeInfo.title
                        }
                    });
                } catch (ex) {
                    console.log(ex);
                }
            }
        }
    }

    onInstalled(details) {
        this.logger.log("installed...");
        this.logger.log(details);
        if (details.reason !== "install") {
            return;
        }
        if (this.registerTabOpen) {
            return;
        }
        chrome.storage.local.get(['registered'], result => {
            if (result && result.registered === true) {
                return;
            }
            chrome.tabs.create({ url: chrome.runtime.getURL("register.html") });
        });
        this.registerTabOpen = true;
    }

    start() {
        this.logger.log("starting...");
        chrome.runtime.onInstalled.addListener(
            this.onInstalled.bind(this)
        );
        this.startNativeHost();
        chrome.downloads.onCreated.addListener(
            this.onDownloadCreated.bind(this)
        );
        chrome.downloads.onDeterminingFilename.addListener(
            this.onDeterminingFilename.bind(this)
        );
        this.logger.log("started.");
        chrome.action.onClicked.addListener(this.actionClicked.bind(this));
        this.requestWatcher.register();
        chrome.tabs.onUpdated.addListener(
            this.onTabUpdate.bind(this)
        );
    }

    shouldTakeOver(url, file) {
        let u = new URL(url);
        let hostName = u.host;
        if (this.blockedHosts.find(item => hostName.indexOf(item) >= 0)) {
            return false;
        }
        let path = file || u.pathname;
        let upath = path.toUpperCase();
        if (this.fileExts.find(ext => upath.endsWith(ext))) {
            return true;
        }
        return false;
    }

    updateActionIcon() {
        chrome.action.setIcon({ path: this.getActionIcon() });
    }

    getActionIconName(icon) {
        return this.enabled ? icon + ".png" : icon + "-mono.png";
    }

    getActionIcon() {
        return {
            "16": this.getActionIconName("icon16"),
            "48": this.getActionIconName("icon48"),
            "128": this.getActionIconName("icon128")
        }
    }

    triggerDownload(url, file, referer, size, mime) {
        let nativePort = this.port;
        chrome.cookies.getAll({ "url": url }, cookies => {
            if (cookies) {
                let cookieStr = cookies.map(cookie => cookie.name + "=" + cookie.value).join("; ");
                let headers = ["User-Agent: " + navigator.userAgent];
                if (referer) {
                    headers.push("Referer: " + referer);
                }
                let data = {
                    url: url,
                    cookie: cookieStr,
                    headers: headers,
                    filename: file,
                    fileSize: size,
                    mimeType: mime,
                    type: "download_data"
                };
                this.logger.log(data);
                nativePort.postMessage(data);
            }
        });
    }

    diconnect() {
        this.port && this.port.disconnect();
        this.onDisconnect();
    }
}
