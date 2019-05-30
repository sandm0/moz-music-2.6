/* global fetch */

(function() {
'use strict';

if (navigator.getDeviceStorages &&
    navigator.getDeviceStorage && navigator.getDeviceStorage('music')) {
  return;
}

const PRELOAD_FILES = [
  // '/media/1/DJ%20Okawari%20-%20Flower%20Dance.mp3',
  '/media/1/fi-fy%20-%20Hesitate.mp3',
  // '/media/1/Foxtail-Grass%20Studio%20-%20%E6%97%A5%E9%98%B4%E3%81%A8%E5%B8%BD%E5%AD%90%E3%81%A8%E9%A3%8E%E9%93%83%E3%81%A8.mp3',
  // '/media/1/Fran%C3%A7oise%20Hardy%20-%20Comment%20Te%20Dire%20Adieu%EF%BC%9F.mp3',
  '/media/1/fumika%20-%20Endless%20Road.mp3',
  // '/media/1/fumika%20-%20%E6%99%82%E3%82%92%E8%B6%8A%E3%81%88%E3%81%A6.mp3',
  '/media/1/Goose%20house%20-%20%E5%85%89%E3%82%8B%E3%81%AA%E3%82%89.mp3',
  '/media/1/HG.mp3',
  '/media/1/Take%20me%20hand.mp3'
];

navigator.getDeviceStorages = getDeviceStorages;
navigator.getDeviceStorage = getDeviceStorage;

var deviceStorages = {};

function getDeviceStorages(storageName) {
  return [getDeviceStorage(storageName)];
}

function getDeviceStorage(storageName) {
  if (deviceStorages[storageName]) {
    return deviceStorages[storageName];
  }

  return (deviceStorages[storageName] = new DeviceStorage(storageName));
}

function DeviceStorage(storageName) {
  this.storageName = storageName;

  this.canBeFormatted = false;
  this.canBeMounted = false;
  this.canBeShared = false;
  this.default = true;
  this.isRemovable = false;

  this.onchange = null;

  this.addEventListener('change', (evt) => {
    if (typeof this.onchange === 'function') {
      this.onchange(evt);
    }
  });

  this._files = [];

  var preloadNextFile = (function(index) {
    if (index >= PRELOAD_FILES.length) {
      return;
    }

    var path = PRELOAD_FILES[index];

    fetch(path)
      .then((result) => {
        result.blob().then((file) => {
          preloadNextFile(++index);

          file.name = decodeURIComponent(path);
          file.lastModifiedDate = new Date();

          this._files.push(file);

          this.dispatchEvent('change', {
            reason: 'created',
            path: file.name
          });
          this.dispatchEvent('change', {
            reason: 'modified',
            path: file.name
          });
        });
      })
      .catch((error) => {
        preloadNextFile(++index);

        console.log('Unable to retrieve preloaded file', path, error);
      });
  }).bind(this);

  preloadNextFile(0);
}

DeviceStorage.prototype = new EventTarget();
DeviceStorage.prototype.constructor = DeviceStorage;

DeviceStorage.prototype.add = function(file) {
  if (file instanceof Blob) {
    return this.addNamed(file, '/' + this.storageName + '/' +
      generateRandomFileName());
  }

  throw 'TypeError: Argument 1 of DeviceStorage.add does not implement ' +
    'interface Blob.';
};

DeviceStorage.prototype.addNamed = function(file, name) {
  if (file instanceof Blob) {
    return new DOMRequest((success, error) => {
      var exists = !!this._files.find(f => f.name === name);
      if (exists) {
        return error({ name: 'Unknown', message: '' });
      }

      file.lastModifiedDate = new Date();
      file.name = name;

      this._files.push(file);
      this.dispatchEvent('change', {
        reason: 'created',
        path: file.name
      });
      this.dispatchEvent('change', {
        reason: 'modified',
        path: file.name
      });

      success(name);
    });
  }

  throw 'TypeError: Argument 1 of DeviceStorage.addNamed does not implement '+
    'interface Blob.';
};

DeviceStorage.prototype.appendNamed = function() {

};

DeviceStorage.prototype.available = function() {
  return new DOMRequest(success => success('available'));
};

DeviceStorage.prototype.delete = function(fileName) {
  return new DOMRequest((success, error) => {
    var file = this._files.find(f => f.name === fileName);
    if (file) {
      this._files.splice(this._files.indexOf(file), 1);
      this.dispatchEvent('change', {
        reason: 'deleted',
        path: file.name
      });

      success();
      return;
    }

    error({ name: 'Unknown', message: '' });
  });
};

DeviceStorage.prototype.enumerate = function(path, options) {
  return new DOMRequest((success, error) => {
    var files = [];

    if (typeof path === 'object') {
      options = path;
      path = '';
    }

    if (!path) {
      options = options || {};
      path = '';
    }

    this._files.forEach((file) => {
      if (options.since instanceof Date &&
          file.lastModifiedDate < options.since) {
        return;
      }

      if (file.name.startsWith(path)) {
        files.push(file);
      }
    });

    if (files.length === 0) {
      return error({ name: 'Unknown', message: '' });
    }

    success(files);
  });
};

DeviceStorage.prototype.enumerateEditable = function() {
  // NOOP
};

DeviceStorage.prototype.format = function() {
  return new DOMRequest(success => success('formatting'));
};

DeviceStorage.prototype.freeSpace = function() {
  return new DOMRequest(success => success(1000000000));
};

DeviceStorage.prototype.get = function(fileName) {
  return new DOMRequest((success, error) => {
    var file = this._files.find(f => f.name === fileName);
    if (file) {
      success(file);
      return;
    }

    error({ name: 'Unknown', message: '' });
  });
};

DeviceStorage.prototype.getFile = function(fileName) {
  return this.get(fileName);
};

DeviceStorage.prototype.getEditable = function() {
  // NOOP
};

DeviceStorage.prototype.getRoot = function() {
  // NOOP
};

DeviceStorage.prototype.mount = function() {
  return new DOMRequest(success => success('mounting'));
};

DeviceStorage.prototype.storageStatus = function() {
  return new DOMRequest(success => success('Mounted'));
};

DeviceStorage.prototype.unmount = function() {
  return new DOMRequest(success => success('unmounting'));
};

DeviceStorage.prototype.usedSpace = function() {
  return new DOMRequest(success => success(
    this._files.reduce((a, b) => (a.size || a) + b.size))
  );
};

function DOMRequest(callback) {
  var success = (result) => {
    this.readyState = 'done';
    this.result = result;

    if (typeof this.onsuccess === 'function') {
      this.onsuccess();
    }
  };

  var error = (error) => {
    this.readyState = 'done';
    this.error = error;

    if (typeof this.onerror === 'function') {
      this.onerror();
    }
  };

  this.readyState = 'pending';

  this.onsuccess = null;
  this.onerror = null;

  if (typeof callback === 'function') {
    setTimeout(() => callback(success, error));
  }
}

DOMRequest.prototype.constructor = DOMRequest;

function DOMCursor(callback) {
  var success = (results) => {
    this.readyState = 'done';

    this._results = results;
    this._index = -1;

    this.continue();
  };

  var error = (error) => {
    this.readyState = 'done';
    this.error = error;

    if (typeof this.onerror === 'function') {
      this.onerror();
    }
  };

  this.readyState = 'pending';
  this.done = false;

  this.onsuccess = null;
  this.onerror = null;

  if (typeof callback === 'function') {
    setTimeout(() => callback(success, error));
  }
}

DOMCursor.prototype = new DOMRequest();
DOMCursor.prototype.constructor = DOMCursor;

DOMCursor.prototype.continue = function() {
  if (this._index >= this._results.length - 1) {
    return;
  }

  this.result = this._results[++this._index];

  if (this._index >= this._results.length - 1) {
    this.done = true;
  }

  if (typeof this.onsuccess === 'function') {
    this.onsuccess();
  }
};

function EventTarget(object) {
  if (typeof object !== 'object') {
    return;
  }

  for (var property in object) {
    this[property] = object[property];
  }
}

EventTarget.prototype.constructor = EventTarget;

EventTarget.prototype.dispatchEvent = function(name, data) {
  var events    = this._events || {};
  var listeners = events[name] || [];
  listeners.forEach(listener => listener.call(this, data));
};

EventTarget.prototype.addEventListener = function(name, listener) {
  var events    = this._events = this._events || {};
  var listeners = events[name] = events[name] || [];
  if (listeners.find(fn => fn === listener)) {
    return;
  }

  listeners.push(listener);
};

EventTarget.prototype.removeEventListener = function(name, listener) {
  var events    = this._events || {};
  var listeners = events[name] || [];
  for (var i = listeners.length - 1; i >= 0; i--) {
    if (listeners[i] === listener) {
      listeners.splice(i, 1);
      return;
    }
  }
};

function generateRandomFileName() {
  var fileName = '';
  for (var i = 0; i < 8; i++) {
    fileName += Math.floor((1 + Math.random()) * 0x10000)
      .toString(16).substr(1);
  }

  return fileName;
}

})();
