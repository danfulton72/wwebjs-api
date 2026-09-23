'use strict'

const methods = require('../../wwebjs/legacy/groupChatMethods')
const { pickMethods } = require('../pickMethods')

module.exports = pickMethods(methods, ['runMethod'])
