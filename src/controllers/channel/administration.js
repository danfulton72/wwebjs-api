'use strict'

const methods = require('../../wwebjs/legacy/channelMethods')
const { pickMethods } = require('../pickMethods')

module.exports = pickMethods(methods, [
  'acceptChannelAdminInvite',
  'deleteChannel',
  'demoteChannelAdmin',
  'revokeChannelAdminInvite',
  'sendChannelAdminInvite',
  'transferChannelOwnership'
])
