#
# Twitter mention processing service.  This service queries out of the twitter database and creates a graph of a certain
# number of "hops" away from a center tweeter

# modification history:
#  5/29/14 CRL added history recording call

import datetime
import itertools
import pymongo
import tangelo
import bson.json_util

# during development, force the external file to be reloaded every time.  This declaration is for the history object and
# supporting utilities

import queryHistory


#------------
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
        # check for any expired entries and remove them 
        self.clearOldHistoryRecords()

    def getCharacterCount(self):
        return len(self.characters)

    def printState(self):
        print "characters:"
        for charIndex in xrange(0,len(self.characters)):
            print self.characters[self.characters.keys()[charIndex]]

    # return the whole list so it can be rendered in a vis or processed some other way. 
    def getHistoryList(self):
        historyList = []
        for key in self.characters:
            historyList.append([ self.characters[key]['tweeter'], self.characters[key]['quantity']])
        print historyList
        return historyList

    # this method implements a rolling-history architecture where the records
    # are kept only for so long.  During each cycle event (when time moves) the list is
    # checked to see if anyone should be removed because they haven't been seen in quite
    # a while.    
    def clearOldHistoryRecords(self):
        keylist = self.characters.keys()
        for key in keylist:
            #currentname = self.characters.keys()[charIndex]
            if self.characters[key]['storeTime'] > self.maxHistoryLength:
                print 'removing old record: ', key
                self.characters.pop(key)

    # this method is invoked when a new query response should be recorded.  
    def addRecord(self,response):
        # save this query result in the ordered list for later examination or mining
        self.queryResponses.append(response)
        if self.senderIndexed:
            # we are indexing by sender
            if response['source'] in self.characters.keys():
                #print "already recorded:",response['source']
                # increment the count of this tweeter since he/she was active in this activity
                self.characters[response['source']]['quantity'] += 1
            else:
                print "new entry:",response['source']
                self.characters[response['source']] = {'tweeter': response['source'],
                                                                        'quantity': 1,
                                                                        'storeTime': self.iterations }


        #self.printState()



#------------





recorders = dict()
#recorders['source'] = queryHistory.TweeterHistory()
#recorders['target'] = queryHistory.TweeterHistory()
recorders['source'] = TweeterHistory()
recorders['source'].setMaxHistoryLength(20)
recorders['target'] = TweeterHistory()
recorders['target'].setIndexByTarget()
queryCount = 0

#

def run(host, database, collection, start_time=None, end_time=None, center=None, degree=None):
    global queryCount
    global recorders
    response = {}

    # force reload of class (useful during development when source code is being changed.) This can be commented out
    # for production use when the code is not being changed anymore.  Note: this trick only works if the objects are instatiated
    # after the class definition is changed.   In the case of this code here, the history objects are instantiated at the global level,
    # see agove, so a cached class definition is used. 

    #reload(queryHistory)

    # Bail with error if any of the required arguments is missing.
    missing = map(lambda x: x[0], filter(lambda x: x[1] is None, zip(["start_time", "end_time", "center", "degree"], [start_time, end_time, center, degree])))
    if len(missing) > 0:
        response["error"] = "missing required arguments: %s" % (", ".join(missing))
        return response

    # Cast the arguments to the right types.
    #
    # The degree is the degree of separation between the center element and the
    # retrieved nodes - an integer.
    try:
        degree = int(degree)
    except ValueError:
        response["error"] = "argument 'degree' must be an integer"
        return response

    # The start time is the number of milliseconds since the epoch (which is how
    # JavaScript dates are constructed, and therefore how dates are stored in
    # MongoDB) - an integer.
    try:
        start_time = datetime.datetime.strptime(start_time, "%Y-%m-%d")
    except ValueError:
        response["error"] = "argument 'start_time' must be in YYYY-MM-DD format"
        return response

    # The end time is another date - an integer.
    try:
        end_time = datetime.datetime.strptime(end_time, "%Y-%m-%d")
    except ValueError:
        response["error"] = "argument 'end_time' must be in YYYY-MM-DD format"
        return response

    # Get a handle to the database collection.
    try:
        connection = pymongo.Connection(host)
        db = connection[database]
        c = db[collection]
    except pymongo.errors.AutoReconnect as e:
        response["error"] = "database error: %s" % (e.message)
        return response

    # Start a set of all interlocutors we're interested in - that includes the
    # center tweeter.
    talkers = set([center])

    # Also start a table of distances from the center.
    distance = {center: 0}

    current_talkers = list(talkers)
    all_results = []
    for i in range(degree):
        # Construct and send a query to retrieve all records involving the
        # current talkers, occurring within the time bounds specified, and
        # involving two known addresses.
        query = {"$and": [ {"date": {"$gte": start_time} },
            {"date": {"$lt": end_time} },
            {"source": {"$ne": ""} },
            {"target": {"$ne": ""} },
            {"$or": [
                {"source": {"$in": current_talkers} },
                {"target": {"$in": current_talkers} }
                ]
            }
            ]
        }
        results = c.find(query, fields=["target", "source"])

        print 'returned ',results.count(),' tweeters'
        for tweeter in results:
            # record this query result and compile the running history of tweeters
            recorders['source'].addRecord(tweeter)
            #recorders['source'].printState()
        results.rewind()

        # Collect the names.
        #current_talkers = list(set(map(lambda x: x["target"] if x["source"] == center else x["source"], results)))
        current_talkers = list(itertools.chain(*map(lambda x: [x["target"], x["source"]], results)))
        talkers = talkers.union(current_talkers)

        # Compute updates to everyone's distance from center.
        for t in current_talkers:
            if t not in distance:
                distance[t] = i+1

        # Rewind and save the cursor.
        results.rewind()
        all_results.append(results)

    # Construct a canonical graph structure from the set of talkers and the list
    # of tweets.
    #
    # Start with an index map of the talkers.
    talkers = list(talkers)
    talker_index = {name: index for (index, name) in enumerate(talkers)}

    # Create a chained iterable from all the rewound partial results.
    all_results = itertools.chain(*all_results)

    # Create a list of graph edges suitable for use by D3 - replace each record
    # in the data with one that carries an index into the tweeters list.
    edges = []
    for result in all_results:
        source = result["source"]
        target = result["target"]
        ident = str(result["_id"])

        rec = { "source": talker_index[source],
                "target": talker_index[target],
                "id": ident }

        edges.append(rec)

    talkers = [{"tweet": n, "distance": distance[n]} for n in talkers]

    # query the history logger to get a list of top tweeters
    historyLog = recorders['source'].getHistoryList()

    # Stuff the graph data into the response object, and return it.
    response["result"] = { "nodes": talkers,
                           "edges": edges,
                           "history":historyLog }

    # count this query and return response.  We call the cycle method on the recorders to indicate 
    queryCount = queryCount+1
    recorders['source'].printState()
    recorders['source'].cycle()
   
    connection.close()

    return bson.json_util.dumps(response)




