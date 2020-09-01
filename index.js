"use strict";
exports.__esModule = true;
var axios_1 = require("axios");
var beciurl = 'http://www.becioutage.org/data/boundaries.json';
var becioutage = await axios_1["default"].get(beciurl);
console.log(becioutage);
