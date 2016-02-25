(function (phoenix) {
  'use strict';

  var babelHelpers = {};

  babelHelpers.classCallCheck = function (instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  };

  babelHelpers.createClass = function () {
    function defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
      }
    }

    return function (Constructor, protoProps, staticProps) {
      if (protoProps) defineProperties(Constructor.prototype, protoProps);
      if (staticProps) defineProperties(Constructor, staticProps);
      return Constructor;
    };
  }();

  babelHelpers;

  var SchruteConn = function () {
    function SchruteConn() {
      babelHelpers.classCallCheck(this, SchruteConn);
    }

    babelHelpers.createClass(SchruteConn, [{
      key: "constructer",
      value: function constructer(endpoint, workerUUID, authParams) {
        this.workerUUID = workerUUID;
        this.socket = new phoenix.Socket(endpoint, {
          params: authParams,
          logger: function logger(kind, msg, data) {
            console.log(kind + ": " + msg, data);
          }
        });
      }
    }, {
      key: "start",
      value: function start() {
        this.socket.connect();
        this.channel = this.socket.channel("workers:" + this.workerUUID);
        this.channel.join().receive("ok", function (resp) {
          console.log("Joined successfully", resp);
        }).receive("error", function (resp) {
          console.log("Unable to join", resp);
        });
      }
    }]);
    return SchruteConn;
  }();;

  var BASE_URL = 'https://portal.rainforest.dev';

  var manifest = chrome.runtime.getManifest();

  // Start disabled: require the tester to enable if they want to
  // work when the browser starts
  var checkingActive = false;
  var infoHash = {
    tester_state: 'active',
    work_available_endpoint: BASE_URL + '/api/1/testers/',
    email: '',
    id: '',
    version: manifest.version
  };
  var websocketConn = undefined;

  // Set polling interval in milliseconds (note, this is rate limted,
  // so if you change agressively, it will error)
  var defaultCheckForWorkInterval = 8 * 1000;
  var checkForWorkInterval = defaultCheckForWorkInterval;

  //
  // Load the initial id value from storage
  //
  chrome.storage.sync.get('worker_uuid', function (data) {
    // Notify that we saved.
    if (data.worker_uuid !== undefined) {
      infoHash.uuid = data.worker_uuid;
      togglePolling(checkingActive);
    } else {
      makeNewSyncTab();
    }
  });

  //
  // Load the initial api endpoint value from storage
  //
  chrome.storage.sync.get('work_available_endpoint', function (data) {
    // Notify that we saved.
    if (data.work_available_endpoint !== undefined) {
      infoHash.work_available_endpoint = data.work_available_endpoint;
      togglePolling(checkingActive);
    } else {
      makeNewSyncTab();
    }
  });

  // Handle the icon being clicked
  //
  // this enables or disables checking for new work
  //
  chrome.browserAction.onClicked.addListener(function () {
    checkingActive = !checkingActive;
    togglePolling(checkingActive);
  });

  function startApp(request, sendResponse) {
    infoHash.uuid = request.data.worker_uuid;
    infoHash.work_available_endpoint = request.data.work_available_endpoint;

    togglePolling(checkingActive);

    // comment this out in dev mode
    sendResponse({ ok: true });

    chrome.storage.sync.set({
      worker_uuid: request.data.worker_uuid,
      work_available_endpoint: request.data.work_available_endpoint
    }, function () {});

    if (request.data.websocket_endpoint != undefined) {
      startWebsocket(request.data);
    }
  }

  function startWebsocket(data) {
    if (websocketConn == undefined) {
      websocketConn = new SchruteConn(data.websocket_endpoint, data.worker_uuid, data.websocket_auth);
      websocketConn.start();
    }
  }

  // Use in dev mode
  // startApp({
  //   data: {
  //     worker_uuid: 'your-worker-id',
  //     work_available_endpoint: 'bouncer-url'}});

  // Handle data coming from the main site
  chrome.runtime.onMessageExternal.addListener(function (request, sender, sendResponse) {
    if (request.data && request.data.worker_uuid && request.data.work_available_endpoint) {
      startApp(request, sendResponse);
    }
  });

  // Set checking state

  function togglePolling(enabled) {
    if (!enabled) {
      chrome.browserAction.setBadgeBackgroundColor({ color: [255, 0, 0, 230] });
      chrome.browserAction.setBadgeText({ text: 'OFF' });
    } else {
      checkForWork();
    }
  }

  // Open or focus the main work tab

  var workTab = null;

  function openOrFocusTab(url) {
    if (workTab === null) {
      makeNewWorkTab(url);
    } else {
      refreshTabInfo();
    }
  }

  // Make sure the work tab is open and in focus

  function refreshTabInfo() {
    chrome.tabs.get(workTab.id, function (tab) {
      if (chrome.runtime.lastError) {
        workTab = null;
      } else {
        workTab = tab;

        // force selection
        if (!workTab.selected) {
          chrome.tabs.update(workTab.id, { selected: true });
        }
      }
    });
  }

  //
  // Open a new work tab
  //
  function makeNewWorkTab(url) {
    // make a new tab
    chrome.tabs.create({ url: url }, function (t) {
      workTab = t;
    });
  }

  //
  // Open a sync tab
  //
  function makeNewSyncTab() {
    // make a new tab
    chrome.tabs.create({ url: BASE_URL + '/profile?version=' + manifest.version }, function () {});
  }

  // Poll for new work

  function checkForWork() {
    if (infoHash.uuid === '' || infoHash.uuid === undefined) {
      return false;
    }

    var xhr = new XMLHttpRequest();

    xhr.open('GET', '' + infoHash.work_available_endpoint + infoHash.uuid + '/work_available?info=' + JSON.stringify(infoHash), true);

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && checkingActive) {
        var resp = JSON.parse(xhr.responseText);
        if (resp.work_available) {
          chrome.browserAction.setBadgeBackgroundColor({ color: [0, 255, 0, 230] });
          chrome.browserAction.setBadgeText({ text: 'YES' });

          openOrFocusTab(resp.url);
        } else {
          chrome.browserAction.setBadgeBackgroundColor({ color: [0, 0, 0, 230] });
          chrome.browserAction.setBadgeText({ text: 'NO' });
        }
      }
    };

    xhr.send();

    if (checkingActive) {
      setTimeout(function () {
        xhr.abort();
        checkForWork();
      }, checkForWorkInterval);
    }

    return true;
  }

  // Get user information

  chrome.identity.getProfileUserInfo(function (info) {
    infoHash.email = info.email;
    infoHash.id = info.id;
  });

  // Get idle checking - this drops the polling rate
  // for "inactive" users (i.e. when AFK)

  var shutOffTimer = undefined;
  chrome.idle.setDetectionInterval(defaultCheckForWorkInterval * 3 / 1000);
  chrome.idle.onStateChanged.addListener(function (state) {
    infoHash.tester_state = state;
    if (state === 'idle') {
      checkForWorkInterval = defaultCheckForWorkInterval * 10;
      shutOffTimer = setTimeout(function () {
        if (infoHash.tester_state === 'idle') {
          checkingActive = false;
          togglePolling(checkingActive);
        }
      }, defaultCheckForWorkInterval * 45);
    } else if (state === 'active') {
      clearTimeout(shutOffTimer);
      checkForWorkInterval = defaultCheckForWorkInterval;
    }
  });

}(phoenix));