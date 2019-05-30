/* exported BlobView */
'use strict';

var BlobView = (function() {
  function fail(msg) {
    throw Error(msg);
  }

  var decoderCache = {};
  function getDecoder(encoding) {
    if (encoding in decoderCache) {
      return decoderCache[encoding];
    }
    var decoder = decoderCache[encoding] = new TextDecoder(encoding);
    return decoder;
  }

  // This constructor is for internal use only.
  // Use the BlobView.get() factory function or the getMore instance method
  // to obtain a BlobView object.
  function BlobView(blob, sliceOffset, sliceLength, slice,
                    viewOffset, viewLength, littleEndian)
  {
    this.blob = blob;                  // The parent blob that the data is from
    this.sliceOffset = sliceOffset;    // The start address within the blob
    this.sliceLength = sliceLength;    // How long the slice is
    this.slice = slice;                // The ArrayBuffer of slice data
    this.viewOffset = viewOffset;      // The start of the view within the slice
    this.viewLength = viewLength;      // The length of the view
    this.littleEndian = littleEndian;  // Read little endian by default?

    // DataView wrapper around the ArrayBuffer
    this.view = new DataView(slice, viewOffset, viewLength);

    // These fields mirror those of DataView
    this.buffer = slice;
    this.byteLength = viewLength;
    this.byteOffset = viewOffset;

    this.index = 0;   // The read methods keep track of the read position
  }

  // Async factory function
  BlobView.get = function(blob, offset, length, callback, littleEndian) {
    if (offset < 0) {
      fail('negative offset');
    }
    if (length < 0) {
      fail('negative length');
    }
    if (offset > blob.size) {
      fail('offset larger than blob size');
    }
    // Don't fail if the length is too big; just reduce the length
    if (offset + length > blob.size) {
      length = blob.size - offset;
    }
    var slice = blob.slice(offset, offset + length);
    var reader = new FileReader();
    reader.readAsArrayBuffer(slice);
    reader.onloadend = function() {
      var result = null;
      if (reader.result) {
        result = new BlobView(blob, offset, length, reader.result,
                              0, length, littleEndian || false);
      }
      callback(result, reader.error);
    };
  };

  // Synchronous factory function for use when you have an array buffer and want
  // to treat it as a BlobView (e.g. to use the readXYZ functions). We need
  // this for the music app, which uses an array buffer to hold
  // de-unsynchronized ID3 frames.
  BlobView.getFromArrayBuffer = function(buffer, offset, length, littleEndian) {
    return new BlobView(null, offset, length, buffer, offset, length,
                        littleEndian);
  };

  BlobView.prototype = {
    constructor: BlobView,

    // This instance method is like the BlobView.get() factory method,
    // but it is here because if the current buffer includes the requested
    // range of bytes, they can be passed directly to the callback without
    // going back to the blob to read them
    getMore: function(offset, length, callback) {
      // If we made this BlobView from an array buffer, there's no blob backing
      // it, and so it's impossible to get more data.
      if (!this.blob) {
        fail('no blob backing this BlobView');
      }

      if (offset >= this.sliceOffset &&
          offset + length <= this.sliceOffset + this.sliceLength) {
        // The quick case: we already have that region of the blob
        callback(new BlobView(this.blob,
                              this.sliceOffset, this.sliceLength, this.slice,
                              offset - this.sliceOffset, length,
                              this.littleEndian));
      }
      else {
        // Otherwise, we have to do an async read to get more bytes
        BlobView.get(this.blob, offset, length, callback, this.littleEndian);
      }
    },

    // Set the default endianness for the other methods
    littleEndian: function() {
      this.littleEndian = true;
    },
    bigEndian: function() {
      this.littleEndian = false;
    },

    // These "get" methods are just copies of the DataView methods, except
    // that they honor the default endianness
    getUint8: function(offset) {
      return this.view.getUint8(offset);
    },
    getInt8: function(offset) {
      return this.view.getInt8(offset);
    },
    getUint16: function(offset, le) {
      return this.view.getUint16(offset,
                                 le !== undefined ? le : this.littleEndian);
    },
    getInt16: function(offset, le) {
      return this.view.getInt16(offset,
                                le !== undefined ? le : this.littleEndian);
    },
    getUint32: function(offset, le) {
      return this.view.getUint32(offset,
                                 le !== undefined ? le : this.littleEndian);
    },
    getInt32: function(offset, le) {
      return this.view.getInt32(offset,
                                le !== undefined ? le : this.littleEndian);
    },
    getFloat32: function(offset, le) {
      return this.view.getFloat32(offset,
                                  le !== undefined ? le : this.littleEndian);
    },
    getFloat64: function(offset, le) {
      return this.view.getFloat64(offset,
                                  le !== undefined ? le : this.littleEndian);
    },

    // These "read" methods read from the current position in the view and
    // update that position accordingly
    readByte: function() {
      return this.view.getInt8(this.index++);
    },
    readUnsignedByte: function() {
      return this.view.getUint8(this.index++);
    },
    readShort: function(le) {
      var val = this.view.getInt16(this.index,
                                   le !== undefined ? le : this.littleEndian);
      this.index += 2;
      return val;
    },
    readUnsignedShort: function(le) {
      var val = this.view.getUint16(this.index,
                                    le !== undefined ? le : this.littleEndian);
      this.index += 2;
      return val;
    },
    readInt: function(le) {
      var val = this.view.getInt32(this.index,
                                   le !== undefined ? le : this.littleEndian);
      this.index += 4;
      return val;
    },
    readUnsignedInt: function(le) {
      var val = this.view.getUint32(this.index,
                                    le !== undefined ? le : this.littleEndian);
      this.index += 4;
      return val;
    },
    readFloat: function(le) {
      var val = this.view.getFloat32(this.index,
                                     le !== undefined ? le : this.littleEndian);
      this.index += 4;
      return val;
    },
    readDouble: function(le) {
      var val = this.view.getFloat64(this.index,
                                     le !== undefined ? le : this.littleEndian);
      this.index += 8;
      return val;
    },

    // Methods to get and set the current position
    tell: function() {
      return this.index;
    },
    remaining: function() {
      return this.byteLength - this.index;
    },
    seek: function(index) {
      if (index < 0) {
        fail('negative index');
      }
      if (index > this.byteLength) {
        fail('index greater than buffer size');
      }
      this.index = index;
    },
    advance: function(n) {
      var index = this.index + n;
      if (index < 0) {
        fail('advance past beginning of buffer');
      }
      // It's usual that when we finished reading one target view,
      // the index is advanced to the start(previous end + 1) of next view,
      // and the new index will be equal to byte length(the last index + 1),
      // we will not fail on it because it means the reading is finished,
      // or do we have to warn here?
      if (index > this.byteLength) {
        fail('advance past end of buffer');
      }
      this.index = index;
    },

    // Additional methods to read other useful things
    getUnsignedByteArray: function(offset, n) {
      return new Uint8Array(this.buffer, offset + this.viewOffset, n);
    },

    // Additional methods to read other useful things
    readUnsignedByteArray: function(n) {
      var val = new Uint8Array(this.buffer, this.index + this.viewOffset, n);
      this.index += n;
      return val;
    },

    getBit: function(offset, bit) {
      var byte = this.view.getUint8(offset);
      return (byte & (1 << bit)) !== 0;
    },

    getUint24: function(offset, le) {
      var b1, b2, b3;
      if (le !== undefined ? le : this.littleEndian) {
        b1 = this.view.getUint8(offset);
        b2 = this.view.getUint8(offset + 1);
        b3 = this.view.getUint8(offset + 2);
      }
      else {    // big end first
        b3 = this.view.getUint8(offset);
        b2 = this.view.getUint8(offset + 1);
        b1 = this.view.getUint8(offset + 2);
      }

      return (b3 << 16) + (b2 << 8) + b1;
    },

    readUint24: function(le) {
      var value = this.getUint24(this.index, le);
      this.index += 3;
      return value;
    },

    // There are lots of ways to read strings. We support binary (raw 8-bit
    // codepoints), Latin-1, UTF-8, and UTF-16. For the latter three, we also
    // support null-terminated versions.

    getBinaryText: function(offset, len) {
      var bytes = new Uint8Array(this.buffer, offset + this.viewOffset, len);
      return String.fromCharCode.apply(String, bytes);
    },

    readBinaryText: function(len) {
      var s = this.getBinaryText(this.index, len);
      this.index += len;
      return s;
    },

    getLatin1Text: function(offset, len) {
      var bytes = new Uint8Array(this.buffer, offset + this.viewOffset, len);
      return getDecoder('latin1').decode(bytes);
    },

    readLatin1Text: function(len) {
      var s = this.getLatin1Text(this.index, len);
      this.index += len;
      return s;
    },

    getUTF8Text: function(offset, len) {
      var bytes = new Uint8Array(this.buffer, offset + this.viewOffset, len);
      return getDecoder('utf-8').decode(bytes);
    },

    readUTF8Text: function(len) {
      var s = this.getUTF8Text(this.index, len);
      this.index += len;
      return s;
    },

    // Get UTF16 text.  If le is not specified, expect a BOM to define
    // endianness.  If le is true, read UTF16LE, if false, UTF16BE.
    getUTF16Text: function(offset, len, le) {
      if (len % 2) {
        fail('len must be a multiple of two');
      }

      var bytes = new Uint8Array(this.buffer, offset + this.viewOffset, len);

      if (le === null || le === undefined) {
        var BOM = (bytes[0] << 8) + bytes[1];

        if (BOM === 0xFEFF) {
          bytes = bytes.subarray(2);
          le = false;
        } else if (BOM === 0xFFFE) {
          bytes = bytes.subarray(2);
          le = true;
        } else {
          le = true;
        }
      }

      var encoding = le ? 'utf-16le' : 'utf-16be';
      return getDecoder(encoding).decode(bytes);
    },

    readUTF16Text: function(len, le) {
      var s = this.getUTF16Text(this.index, len, le);
      this.index += len;
      return s;
    },

    // Read 4 bytes, ignore the high bit and combine them into a 28-bit
    // big-endian unsigned integer.
    // This format is used by the ID3v2 metadata.
    getID3Uint28BE: function(offset) {
      var b1 = this.view.getUint8(offset) & 0x7f;
      var b2 = this.view.getUint8(offset + 1) & 0x7f;
      var b3 = this.view.getUint8(offset + 2) & 0x7f;
      var b4 = this.view.getUint8(offset + 3) & 0x7f;
      return (b1 << 21) | (b2 << 14) | (b3 << 7) | b4;
    },

    readID3Uint28BE: function() {
      var value = this.getID3Uint28BE(this.index);
      this.index += 4;
      return value;
    },

    // Read bytes up to and including a null terminator, but never
    // more than size bytes.  And return as a Latin1 string.  If advance_by_size
    // is true, this will always seek ahead by `size` bytes, even if a null
    // character was found earlier.
    readNullTerminatedLatin1Text: function(size, advance_by_size = false) {
      var bytes = new Uint8Array(this.buffer, this.viewOffset + this.index,
                                 size);

      var nil = bytes.indexOf(0);
      if (nil !== -1) {
        bytes = bytes.subarray(0, nil);
      }

      var s = getDecoder('latin1').decode(bytes);
      if (nil === -1 || advance_by_size) {
        this.index += size;
      } else {
        this.index += nil + 1;
      }
      return s;
    },

    // Read bytes up to and including a null terminator, but never
    // more than size bytes.  And return as a UTF8 string.  If advance_by_size
    // is true, this will always seek ahead by `size` bytes, even if a null
    // character was found earlier.
    readNullTerminatedUTF8Text: function(size, advance_by_size = false) {
      var bytes = new Uint8Array(this.buffer, this.viewOffset + this.index,
                                 size);

      var nil = bytes.indexOf(0);
      if (nil !== -1) {
        bytes = bytes.subarray(0, nil);
      }

      var s = getDecoder('utf-8').decode(bytes);
      if (nil === -1 || advance_by_size) {
        this.index += size;
      } else {
        this.index += nil + 1;
      }
      return s;
    },

    // Read UTF16 text.  If le is not specified, expect a BOM to define
    // endianness.  If le is true, read UTF16LE, if false, UTF16BE
    // Read until we find a null-terminator, but never more than size bytes.
    // If advance_by_size is true, this will always seek ahead by `size` bytes,
    // even if a null character was found earlier.
    readNullTerminatedUTF16Text: function(size, le, advance_by_size = false) {
      if (size % 2) {
        fail('size must be a multiple of two');
      }

      for (var len = 0; len < size; len += 2) {
        if (this.getUint16(this.index + len, le) === 0) {
          break;
        }
      }

      var s = this.getUTF16Text(this.index, len, le);
      if (len === size || advance_by_size) {
        this.index += size;
      } else {
        this.index += len + 2;
      }
      return s;
    }
  };

  // We don't want users of this library to accidentally call the constructor
  // instead of using one of the factory functions, so we return a dummy object
  // instead of the real constructor. If someone really needs to get at the
  // real constructor, the contructor property of the prototype refers to it.
  return {
    get: BlobView.get,
    getFromArrayBuffer: BlobView.getFromArrayBuffer
  };
}());

/* global FLACMetadata, ForwardLockMetadata, ID3v1Metadata, ID3v2Metadata,
   LazyLoader, MP4Metadata, OggMetadata */
/* exported MetadataFormats */
'use strict';

/**
 * Delegates metadata parsing to the appropriate parser based on magic header
 * values.
 */
var MetadataFormats = (function() {

  /*
   * This is the list of formats that we know how to parse. Each format has
   * three properties:
   *
   * @property {String} file The path to the file for parsing this metadata
   *   format.
   * @property {Object} module A getter that returns the module object for this
   *   parser. Note: It *must* be a getter because it needs to be evaluated
   *   *after* the file is loaded.
   * @property {Function} match A function that takes a BlobView of the file
   *   and returns true if the file uses this metadata format.
   */
  var formats = [
    {
      file: 'js/metadata/forward_lock.js',
      get module() { return ForwardLockMetadata; },
      match: function(header) {
        return header.getBinaryText(0, 9) === 'LOCKED 1 ';
      }
    },
    {
      file: 'js/metadata/id3v2.js',
      get module() { return ID3v2Metadata; },
      match: function(header) {
        return header.getBinaryText(0, 3) === 'ID3';
      }
    },
    {
      file: 'js/metadata/ogg.js',
      get module() { return OggMetadata; },
      match: function(header) {
        return header.getBinaryText(0, 4) === 'OggS';
      }
    },
    {
      file: 'js/metadata/flac.js',
      get module() { return FLACMetadata; },
      match: function(header) {
        return header.getBinaryText(0, 4) === 'fLaC';
      }
    },
    {
      file: 'js/metadata/mp4.js',
      get module() { return MP4Metadata; },
      match: function(header) {
        return header.getBinaryText(4, 4) === 'ftyp';
      }
    },
    {
      file: 'js/metadata/id3v1.js',
      get module() { return ID3v1Metadata; },
      match: function(header) {
        return (header.getUint16(0, false) & 0xFFFE) === 0xFFFA;
      }
    }
  ];

  /**
   * Create a new metadata parser for a particular file format.
   *
   * @param {Object} formatInfo A description of the file format containing a
   *   `file` attribute for the file to load, and a `module` attribute returning
   *   the module that contains the parse() method we should call.
   */
  function MetadataParser(formatInfo) {
    this._formatInfo = formatInfo;
  }

  MetadataParser.prototype = {
    /**
     * Parse a file and return a Promise with the metadata.
     *
     * @param {BlobView} header The file in question.
     * @return {Promise} A Promise that resolves with the completed metadata
     *   object.
     */
    parse: function(header) {
      var info = this._formatInfo;
      return LazyLoader.load(info.file).then(() => {
        return info.module.parse(header);
      });
    }
  };

  /**
   * Find the appropriate metadata parser for a given file.
   *
   * @param {BlobView} header The file in question.
   * @return {MetadataParser} The metadata parser to use for this file.
   */
  function findParser(header) {
    for (var i = 0; i < formats.length; i++) {
      if (formats[i].match(header)) {
        return new MetadataParser(formats[i]);
      }
    }
    return null;
  }

  return {
    findParser: findParser
  };

})();

/* global BlobView, MetadataFormats */
/* exported AudioMetadata */
'use strict';

// XXX We're hiding the fact that these are JSdoc comments because our linter
// refuses to accept "property" as a valid tag. Grumble grumble.

/*
 * Metadata for a track.
 *
 * @typedef {Object} Metadata
 * @property {String} tag_format The format of the tag (e.g. id3v2.4).
 * @property {String} artist The track's artist.
 * @property {String} album The track's album.
 * @property {String} title The track's title.
 * @property {Number} [tracknum] The number of the track on the album.
 * @property {Number} [trackcount] The total number of tracks in the album.
 * @property {Number} [discnum] The number of the disc on the album.
 * @property {Number} [disccount] The total number of discs in the album.
 * @property {Picture} [picture] The cover art, if any.
 * @property {Number} rated The track's rating; starts at 0.
 * @property {Number} played The track's play count; starts at 0.
 */

/**
 * Parse the metadata for an audio file.
 */
var AudioMetadata = (function() {
  /**
   * Parse the specified blob and return a Promise with the metadata.
   *
   * @param {Blob} blob The audio file to parse.
   * @param {String} [filename] The name of the file, used as a fallback if
   *   the metadata has no title field.
   * @return {Promise} A Promise returning the parsed metadata object.
   */
  function parse(blob, filename = null) {
    if (!filename) {
      filename = blob.name;
    }

    // If blob.name exists, it should be an audio file from system
    // otherwise it should be an audio blob that probably from network/process
    // we can still parse it but we don't need to care about the filename
    if (filename) {
      // If the file is in the DCIM/ directory and has a .3gp extension
      // then it is a video, not a music file and we ignore it
      if (filename.slice(0, 5) === 'DCIM/' &&
          filename.slice(-4).toLowerCase() === '.3gp') {
        return Promise.reject('skipping 3gp video file');
      }
    }

    // If the file is too small to be a music file then ignore it
    if (blob.size < 128) {
      return Promise.reject('file is empty or too small');
    }

    // Read the start of the file, figure out what kind it is, and call
    // the appropriate parser.  Start off with an 64kb chunk of data.
    // If the metadata is in that initial chunk we won't have to read again.
    return new Promise(function(resolve, reject) {
      var headersize = Math.min(64 * 1024, blob.size);
      BlobView.get(blob, 0, headersize, function(header, error) {
        if (error) {
          reject(error);
          return;
        }

        try {
          var parser = MetadataFormats.findParser(header);
          var promise;
          if (parser) {
            promise = parser.parse(header);
          } else {
            // This is some kind of file that we don't know about.
            // Let's see if we can play it.
            promise = checkPlayability(blob);
          }

          resolve(promise.then(function(metadata) {
            return addDefaultMetadata(metadata || {}, filename);
          }));
        } catch (e) {
          console.error('AudioMetadata.parse:', e, e.stack);
          reject(e);
        }
      });
    });
  }

  /**
   * Fill in any default metadata fields, such as a fallback for the title, and
   * the rating/playcount.
   *
   * @param {Object} metadata The metadata from one of our parsers.
   * @param {String} filename The name of the underlying file, if any.
   * @return {Object} The updated metdata object.
   */
  function addDefaultMetadata(metadata, filename) {
    if (!metadata.artist) {
      metadata.artist = '';
    }
    if (!metadata.album) {
      metadata.album = '';
    }
    if (!metadata.title) {
      // If the blob has a name, use that as a default title in case
      // we can't find one in the file
      if (filename) {
        var p1 = filename.lastIndexOf('/');
        var p2 = filename.lastIndexOf('.');
        if (p2 <= p1) {
          p2 = filename.length;
        }
        metadata.title = filename.substring(p1 + 1, p2);
      } else {
        metadata.title = '';
      }
    }

    metadata.rated = metadata.played = 0;
    return metadata;
  }

  /**
   * Check if a blob can be played as an audio file.
   *
   * @param {Blob} blob The file to test.
   * @return {Promise} A promise that resolves successfully if the file is
   *   playable.
   */
  function checkPlayability(blob) {
    var player = new Audio();
    player.mozAudioChannelType = 'content';
    var canplay = blob.type && player.canPlayType(blob.type);
    if (canplay === 'probably') {
      return Promise.resolve();
    } else {
      return new Promise(function(resolve, reject) {
        var url = URL.createObjectURL(blob);
        player.src = url;

        // XXX: There seems to have been a gecko regression, and error events
        // are no longer being fired when we try to play some invalid audio
        // files. To work around this, we use a timeout to assume the file is
        // unplayable if we nave not gotten any events within a reasonable
        // amount of time. See also bugs 1208331 and 1198169.
        const CANPLAY_TIMEOUT = 3000;
        var timeoutId = setTimeout(() => {
          console.error('No oncanplay or error events seen yet.',
                        'Assuming file is corrupt:', blob.name);
          player.onerror();
        }, CANPLAY_TIMEOUT);

        player.onerror = function() {
          clearTimeout(timeoutId);
          URL.revokeObjectURL(url);
          player.removeAttribute('src');
          player.load();
          reject('Unplayable music file');
        };

        player.oncanplay = function() {
          clearTimeout(timeoutId);
          URL.revokeObjectURL(url);
          player.removeAttribute('src');
          player.load();
          resolve();
        };
      });
    }
  }

  return {
    parse: parse
  };
})();
