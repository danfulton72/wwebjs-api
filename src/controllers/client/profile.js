'use strict'

const methods = require('../../wwebjs/legacy/clientMethods')
const { pickMethods } = require('../pickMethods')

module.exports = pickMethods(methods, [
  'deleteProfilePicture',
  'resetState',
  'setAutoDownloadAudio',
  'setAutoDownloadDocuments',
  'setAutoDownloadPhotos',
  'setAutoDownloadVideos',
  'setBackgroundSync',
  'setDisplayName',
  'setProfilePicture',
  'setStatus'
])
