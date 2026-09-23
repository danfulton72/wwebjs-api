'use strict'

const client = require('../src/controllers/clientController')
const message = require('../src/controllers/messageController')
const channel = require('../src/controllers/channelController')
const groupChat = require('../src/controllers/groupChatController')

const expectMethods = (controller, methods) => {
  for (const method of methods) expect(typeof controller[method]).toBe('function')
}

describe('split controller facades', () => {
  it('preserves client controller surface', () => {
    expectMethods(client, ['sendMessage', 'getContacts', 'createGroup', 'getChannels', 'runMethod'])
  })

  it('preserves message controller surface', () => {
    expectMethods(message, ['getClassInfo', 'downloadMedia', 'react', 'reply', 'runMethod'])
  })

  it('preserves channel controller surface', () => {
    expectMethods(channel, ['getClassInfo', 'sendMessage', 'getSubscribers', 'deleteChannel'])
  })

  it('preserves group chat controller surface', () => {
    expectMethods(groupChat, ['getClassInfo', 'addParticipants', 'setSubject', 'runMethod'])
  })
})
