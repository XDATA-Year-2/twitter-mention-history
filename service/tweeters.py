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

import time
import pymongo
import bson.json_util
import json
from bson import ObjectId
from pymongo import Connection
import string


class TweeterHistory:
    def __init__(self):
        self.stickyCount = 0
        self.stickyEnabled = False
        self.senderIndexed = True
        self.queryResponses = []
        self.maxHistoryLength = 999999999
        self.topkvalue = 25             # default number of items to return
        self.mongodbname = 'kitware_y2'
        self.sessionname = ''   # to be initialized at instantiation time
        self.mongoconnection = 0    # connection object
        self.data_coll = 0                  # storage collection itself


    def openHistoryStorage(self):
        #specialize the session name depending on when this was started and its sender/receiver settings
        if self.senderIndexed:
            direction = 'source'
        else:
            direction = 'target'
        self.sessionname  = 'mentionHistory_' + time.strftime('%m%d%y')+direction+'_'+time.strftime('%H%M%S')
        collectionNameNoDashes = string.replace(self.sessionname,'-','_')
        print "history opening collection name: ",collectionNameNoDashes
        try:
            self.mongoconnection = Connection('localhost', 27017)
            db = self.mongoconnection[self.mongodbname]
            self.data_coll = db[collectionNameNoDashes]
            self.sessionname = collectionNameNoDashes
            # this is the first entry so, start with iterations = 0
            self.data_coll.insert({'iterations':0})
        except (IOError,ValueError):
            print "History: Error. unable to open mongo connection.. "

    # how long should a character be saved before it is removed because it is too old
    def setMaxHistoryLength(self,maxHistory):
        self.maxHistoryLength = maxHistory

    # the default behavior is to watch the senders, but this can be instantiated to listen to the most 
    # prolific receivers as well by invoking this method after startup but before queries are passed to it
    def setIndexByTarget(self):
        self.senderIndexed = False

    # define what the value of k is when returning the "top k" history entries
    def setNumberOfValuesToReturn(self,kvalue):
        self.topkvalue = kvalue

    # set a sticky bit associated with a particular character if this character is ever mentioned more than
    # the number of times on the threshold (stickyCount )
    def enableStickyCharacters(self,stickyflag,count):
        self.sourceObject = stickyflag
        self.stickyCount = count

    # keep track of the query iterations, so each entry is assigned a value suitable for its position in the history.
    # the age values can be used to prune the history when an entry is too old.
    def cycle(self):
        # check for any expired entries and remove them 
        self.data_coll.update( {'iterations': {'$exists': 1}}, { '$inc': { 'iterations': 1 } } )
        self.clearOldHistoryRecords()

    def getCharacterCount(self):
        return self.data_coll.find({'storeTime': {'$exists': True}}).count()

    def printState(self):
        print "characters:"
        iterator = self.data_coll.find({'storeTime': {'$exists': 1}})
        for record in iterator:
            print record

    # return the whole list so it can be rendered in a vis or processed some other way. 
    def getHistoryList(self):
        historyList = []
        # we project away the Id field so it doesn't get copied through to VEGA and waste transfer capacity

        #find({'storeTime': {'$exists': 1}},{'_id':0}).sort({'quantity':1})
        iterator = self.data_coll.find({'storeTime': {'$exists': 1}},{'_id':0})
        for record in iterator:
            historyList.append(record)
        print historyList
        return historyList

    # clear out all the data structures and prepare to start again, except the configuration 
    # variables (maxHistoryLength, etc.) are maintained.
    def reset(self):
        self.data_coll.drop()
        self.data_coll.update({'iterations': {'$exists': 1}} , { 'iterations': 0 } )

    # this method implements a rolling-history architecture where the records
    # are kept only for so long.  During each cycle event (when time moves) the list is
    # checked to see if anyone should be removed because they haven't been seen in quite
    # a while.    
    def clearOldHistoryRecords(self):
        # return only records that are history records.  
        iterator = self.data_coll.find({'storeTime': {'$exists': 1}})
        for record in iterator:
            if record['storeTime'] > self.maxHistoryLength:
                print 'removing old record: ', record['tweeter']
                self.data_coll.delete(record)

    # this method is invoked when a new query response should be recorded.  
    def addRecord(self,response):
        if len(self.sessionname)==0:
            # initialize storage first time if it hasn't been opened already
            self.openHistoryStorage()
        # save this query result in the ordered list for later examination or mining
        self.queryResponses.append(response)
        if self.senderIndexed:
            # we are indexing by sender
            #if response['source'] in self.characters.keys():
            if (self.data_coll.find({'tweeter': response['source']}).count() > 0):
                print "already recorded:",response['source']
                # increment the count of this tweeter since he/she was active in this activity
                #self.characters[response['source']]['quantity'] += 1
                self.data_coll.update( { "tweeter": response["source"] }, { '$inc': { 'quantity': 1 } } )
            else:
                print "new entry:",response['source']
                iterationcount = self.data_coll.find({'iterations':{'$exists':1}})[0]['iterations']
                self.data_coll.insert({'tweeter': response['source'],
                                                                        'quantity': 1,
                                                                        'storeTime': iterationcount })
        else:
            # we are indexing by receiver
            if (self.data_coll.find({'tweeter': response['target']}).count() > 0):
                print "already recorded:",response['target']
                # increment the count of this tweeter since he/she was active in this activity
                #self.characters[response['source']]['quantity'] += 1
                self.data_coll.update( { "tweeter": response["target"] }, { '$inc': { 'quantity': 1 } } )
            else:
                print "new entry:",response['target']
                iterationcount = self.data_coll.find({'iterations':{'$exists':1}})[0]['iterations']
                self.data_coll.insert({'tweeter': response['target'],
                                                                        'quantity': 1,
                                                                        'storeTime': iterationcount })


        #self.printState()



#------------





recorders = dict()
#recorders['source'] = queryHistory.TweeterHistory()
#recorders['target'] = queryHistory.TweeterHistory()
recorders['source'] = TweeterHistory()
recorders['source'].setMaxHistoryLength(20)
recorders['target'] = TweeterHistory()
recorders['target'].setIndexByTarget()
recorders['target'].setMaxHistoryLength(20)
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
            recorders['target'].addRecord(tweeter)
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
    targetHistoryLog = recorders['target'].getHistoryList()
    # Stuff the graph data into the response object, and return it.
    response["result"] = { "nodes": talkers,
                           "edges": edges,
                           "history":historyLog, 
                           "targetHistory": targetHistoryLog }

    # count this query and return response.  We call the cycle method on the recorders to indicate 
    queryCount = queryCount+1

    # tell the history object the cycle has ended
    recorders['source'].printState()
    recorders['source'].cycle()
    recorders['target'].printState()
    recorders['target'].cycle()

    connection.close()

    return bson.json_util.dumps(response)




