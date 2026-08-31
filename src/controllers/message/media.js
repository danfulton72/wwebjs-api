'use strict'

const methods = require('../../wwebjs/legacy/messageMethods')
const { pickMethods } = require('../pickMethods')

module.exports = pickMethods(methods, [
  'downloadMedia',
  'downloadMediaAsData'
])
