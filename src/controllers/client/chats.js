'use strict'

const methods = require('../../wwebjs/legacy/clientMethods')
const { pickMethods } = require('../pickMethods')

module.exports = pickMethods(methods, [
  'addOrRemoveLabels',
  'archiveChat',
  'getChatById',
  'getChatLabels',
  'getChats',
  'getChatsByLabelId',
  'getChatsWithSearch',
  'getLabelById',
  'getLabels',
  'markChatUnread',
  'muteChat',
  'openChatWindow',
  'openChatWindowAt',
  'pinChat',
  'syncHistory',
  'unarchiveChat',
  'unmuteChat',
  'unpinChat'
])
