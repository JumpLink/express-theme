var express = require("express");
var Theme = (function () {
    function Theme(options) {
        this.options = options;
        this.router = express.Router();
    }
    Theme.prototype.express = function (meters) {
        console.log(" moved " + meters + "m.");
        return function (res, req, next) {
            next();
        };
    };
    return Theme;
})();
exports.Theme = Theme;
