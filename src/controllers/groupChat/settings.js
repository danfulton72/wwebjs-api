'use strict'

const methods = require('../../wwebjs/legacy/groupChatMethods')
const { pickMethods } = require('../pickMethods')

module.exports = pickMethods(methods, [
  'deletePicture',
  'getClassInfo',
  'setDescription',
  'setInfoAdminsOnly',
  'setMessagesAdminsOnly',
  'setPicture',
  'setSubject'
])
