
class TweeterHistory:
    def __init__(self):
        self.stickyCount = 0
        self.stickyEnabled = False
        self.iterations = 0
        self.senderIndexed = True
        self.characters = dict()            # store characters indexed by name 
        self.queryResponses = []
        self.maxHistoryLength = 999999999

    # how long should a character be saved before it is removed because it is too old
    def setMaxHistoryLength(self,maxHistory):
        self.maxHistoryLength = maxHistory

    # the default behavior is to watch the senders, but this can be instantiated to listen to the most 
    # prolific receivers as well by invoking this method after startup but before queries are passed to it
    def setIndexByTarget(self):
        self.senderIndexed = False

    # set a sticky bit associated with a particular character if this character is ever mentioned more than
    # the number of times on the threshold (stickyCount )
    def enableStickyCharacters(self,stickyflag,count):
        self.sourceObject = stickyflag
        self.stickyCount = count

    def getActivity(self):
        return len(self.queryResponses)

    # keep track of the query iterations, so each entry is assigned a value suitable for its position in the history.
    # the age values can be used to prune the history when an entry is too old.
    def cycle(self):
        self.iterations += 1

    def getCharacterCount(self):
        return len(self.characters)

    def printState(self):
        print "more good and boss stuff characters:"
        for charIndex in xrange(0,len(self.characters)):
            print self.characters[self.characters.keys()[charIndex]]

    # this method is invoked when a new query response should be recorded
    def addRecord(self,response):
        # save this query result in the ordered list for later examination or mining
        self.queryResponses.append(response)
        if self.senderIndexed:
            # we are indexing by sender
            if response['source'] in self.characters.keys():
                print "already recorded:",response['source']
                # increment the count of this tweeter since he was active in this activity
                self.characters[response['source']]['quantity'] += 1
            else:
                print "new entry:",response['source']
                self.characters[response['source']] = {'tweeter': response['source'],
                                                                        'quantity': 1,
                                                                        'storeTime': self.iterations }

        self.printState()



