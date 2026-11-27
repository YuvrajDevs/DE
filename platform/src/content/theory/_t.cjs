// Theory topic builder. md uses the same « » backtick shorthand and dedent as lessons.
const H = require('../_h.cjs');
const T = (md, extra = {}) => ({ md: H.learn('', md).md, ...extra });
module.exports = { T, ...H };
