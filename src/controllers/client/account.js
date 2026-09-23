'use strict'

const methods = require('../../wwebjs/legacy/clientMethods')
const { pickMethods } = require('../pickMethods')

module.exports = pickMethods(methods, [
  'getClassInfo',
  'getBlockedContacts',
  'getCommonGroups',
  'getContactById',
  'getContacts',
  'getContactDeviceCount',
  'getContactLidAndPhone',
  'getCountryCode',
  'getFormattedNumber',
  'getNumberId',
  'getProfilePictureUrl',
  'getState',
  'getWWebVersion',
  'isRegisteredUser'
])
