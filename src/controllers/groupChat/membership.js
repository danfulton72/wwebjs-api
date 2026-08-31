'use strict'

const methods = require('../../wwebjs/legacy/groupChatMethods')
const { pickMethods } = require('../pickMethods')

module.exports = pickMethods(methods, [
  'addParticipants',
  'approveGroupMembershipRequests',
  'demoteParticipants',
  'getGroupMembershipRequests',
  'getInviteCode',
  'leave',
  'promoteParticipants',
  'rejectGroupMembershipRequests',
  'removeParticipants',
  'revokeInvite'
])
