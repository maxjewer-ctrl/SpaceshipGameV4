mergeInto(LibraryManager.library, {
  KestrelBridgeReady: function () {
    window.kestrel = window.kestrel || {};
    window.kestrel.ready = true;
    var status = document.querySelector("#acceptance-status");
    if (status) status.textContent = "Unity ready · acceptance not run";
  },

  KestrelBridgeState: function (statePtr) {
    window.kestrel = window.kestrel || {};
    window.kestrel.lastState = UTF8ToString(statePtr);
  },

  KestrelBridgeCapture: function () {
    window.kestrel = window.kestrel || {};
    if (typeof window.kestrel.capture === "function") {
      window.kestrel.capture();
    }
  },

  KestrelLocalStorageSave: function (keyPtr, valuePtr) {
    localStorage.setItem(UTF8ToString(keyPtr), UTF8ToString(valuePtr));
  },

  KestrelLocalStorageLoad: function (keyPtr) {
    var value = localStorage.getItem(UTF8ToString(keyPtr)) || "";
    return stringToNewUTF8(value);
  }
});
