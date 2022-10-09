
document.addEventListener('DOMContentLoaded', function () {
    window.open("xdm-app:chrome-extension://" + chrome.runtime.id + "/");
    document.getElementById("link").href = "xdm-app:chrome-extension://" + chrome.runtime.id + "/"
}, false);