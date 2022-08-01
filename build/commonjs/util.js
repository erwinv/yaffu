"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlinkNoThrow = exports.asyncNoThrow = void 0;
const lodash_es_1 = require("lodash-es");
const promises_1 = require("fs/promises");
function asyncNoThrow(fn) {
    return async (...args) => fn(...args).catch(lodash_es_1.noop);
}
exports.asyncNoThrow = asyncNoThrow;
exports.unlinkNoThrow = asyncNoThrow(promises_1.unlink);
