'use strict'

const methods = require('../../wwebjs/legacy/channelMethods')
const { pickMethods } = require('../pickMethods')

module.exports = pickMethods(methods, [
  'fetchMessages',
  'getClassInfo',
  'getSubscribers',
  'mute',
  'sendMessage',
  'sendSeen',
  'setDescription',
  'setProfilePicture',
  'setReactionSetting',
  'setSubject',
  'unmute'
])
