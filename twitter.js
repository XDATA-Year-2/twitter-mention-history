/*jslint browser:true, unparam:true */
/*globals $, console, d3, tangelo */

var color = null;
var force = null;
var graph = null;
var svg = null;
var width = 0;
var height = 0;
var transition_time;

var twitter = {};
twitter.date = null;
twitter.range = null;
twitter.center = null;
twitter.degree = null;
twitter.history_length = null;
twitter.host = null;
twitter.ac = null;
twitter.textmode = true;

//should user click of node make this node the new center?
twitter.clickCausesFollow = false;

var LoggingLocation = "http://xd-draper.xdata.data-tactics-corp.com:1337"
// testmode = false means logging is on
twitter.testMode = false;
twitter.echoLogsToConsole = true;

twitter.ac = new activityLogger().echo(twitter.echoLogsToConsole).testing(twitter.testMode);
ac = twitter.ac
twitter.ac.registerActivityLogger(LoggingLocation, "Kitware_Twitter_Mention", "3.0");


twitter.dayColor = d3.scale.category10();
twitter.monthColor = d3.scale.category20();

twitter.dayName = d3.time.format("%a");
twitter.monthName = d3.time.format("%b");
twitter.dateformat = d3.time.format("%a %b %e, %Y (%H:%M:%S)");

twitter.monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
];

twitter.dayNames = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat"
];

// make alternating blue and tan colors gradually fading to background to add color gradient to network
// see http://en.wikipedia.org/wiki/Web_colors
twitter.nodeColorArray = [
        "#ff2f0e","#1f77b4","#cd853f","#1e90b4", "#f5deb3","#add8e6","#fff8dc",
        "#b0e0e6","#faf0e6","#e0ffff","#fff5e0","#f0fff0"
];


twitter.getMongoDBInfo = function () {
    "use strict";

    // Read in the config options regarding which MongoDB
    // server/database/collection to use. Hardcode to reduce chance for errors during demonstrations.
    return {
        server: 'localhost',
        db:  'year2',
        coll:  'twitter'

    };
};

function stringifyDate(d) {
    "use strict";

    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function displayDate(d) {
    "use strict";

    return twitter.monthNames[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
}



// This function is attached to the hover event for displayed d3 entities.  This means each rendered tweet has
// a logger installed so if a hover event occurs, a log of the user's visit to this entity is sent to the activity log

function loggedVisitToEntry(d) {
        //console.log("mouseover of entry for ",d.user)
        twitter.ac.logUserActivity("hover over entity: "+d.tweet, "hover", twitter.ac.WF_EXPLORE);
     
}

function loggedDragVisitToEntry(d) {
        //console.log("mouseover of entry for ",d.user)
        twitter.ac.logUserActivity("drag entity: "+d.tweet, "hover", twitter.ac.WF_EXPLORE);
}


function updateGraph() {
    "use strict";
     //twitter.ac.logUserActivity("Update Rendering.", "render", twitter.ac.WF_SEARCH);
     twitter.ac.logSystemActivity('Kitware Twitter Mention - updateGraph display executed');
    var center,
        data,
        end_date,
        hops,
        change_button,
        start_date,
        update;

    update = d3.select("#update");
    change_button = !update.attr("disabled");

    if (change_button) {
        update.attr("disabled", true)
            .text("Updating...");
    }

    // Construct a Javascript date object from the date slider.
    start_date = new Date(twitter.date.slider("value"));

    // Create another date that is ahead of the start date by the number of days
    // indicated by the slider (i.e., advanced from that date by the number of
    // milliseconds in that many days).
    end_date = new Date(start_date.getTime() + twitter.range.slider("value") * 86400 * 1000);

    center = twitter.center.val();

    hops = twitter.degree.spinner("value");

    data = {
        start_time: stringifyDate(start_date),
        end_time: stringifyDate(end_date),
        center: center,
        degree: hops
    };
     var logText;
     logText = "query clause: start="+data.start_time+" center="+center+" degree="+hops
     twitter.ac.logSystemActivity('Kitware Twitter Mention -'+logText);

    $.ajax({
        url: "service/tweeters/" + twitter.host + "/year2/twitter_mentions_v2",
        data: data,
        dataType: "json",
        success: function (response) {
            var angle,
                enter,
                link,
                map,
                newidx,
                node,
                tau;

            if (change_button) {
                d3.select("#update")
                    .attr("disabled", null)
                    .text("Update");
            }

            if (response.error || response.result.length === 0) {
                //console.log("error: " + response.error);
                return;
            }

            //console.log('data returned:',response.result)

            // Save the last iteration of node data, so we can transfer the
            // positions to the new iteration.
            map = {};
            $.each(force.nodes(), function (i, v) {
                map[v.tweet] = v;
            });

            graph = response.result;
            newidx = [];
            $.each(graph.nodes, function (i, v) {
                if (map.hasOwnProperty(v.tweet)) {
                    graph.nodes[i].x = map[v.tweet].x;
                    graph.nodes[i].y = map[v.tweet].y;
                } else {
                    newidx.push(i);
                }
            });

            // CRL - moved to 1/4 into screen instead of 1/2
            tau = 2 * Math.PI;
            angle = tau / newidx.length;
            $.each(newidx, function (i, v) {
                graph.nodes[i].x = (width / 4) * Math.cos(i * angle) + (width / 4);
                graph.nodes[i].y = (height / 4) * Math.sin(i * angle) + (height / 2);
            });

            transition_time = 600;

            link = svg.select("g#links")
                .selectAll(".link")
                .data(graph.edges, function (d) {
                    return d.id;
                });

            link.enter().append("line")
                .classed("link", true)
                .style("opacity", 0.0)
                .style("stroke-width", 0.0)
                .transition()
                .duration(transition_time)
                .style("opacity", 0.6)
                .style("stroke","grey")
                .style("stroke-width", 1.0);

            link.exit()
                .transition()
                .duration(transition_time)
                .style("opacity", 0.0)
                .style("stroke-width", 0.0)
                .remove();

            node = svg.select("g#nodes")
                .selectAll(".node")
                .data(graph.nodes, function (d) { return d.tweet; })
                .on("mouseover", function(d) {
                        loggedVisitToEntry(d)
                });


            // the user may want to force re-centering on the graph by clicking a new center
            // directly.  Add this callback to always fire, then the method only takes action if
            // the "following" mode is set. 
/**
            var node2 = svg.select("g#nodes")
                .selectAll(".node")
                .data(graph.nodes, function (d) { return d.tweet; })
                .enter()
                .on("click", function(d) {
                        console.log('click was heard')
                        centerOnClickedGraphNode(d.tweet)
                });

**/

            // support two different modes, where circular nodes are drawn for each entity or for where the
            // sender name is used inside a textbox. if twitter.textmode = true, then render text

            if (!twitter.textmode) {
                    enter = node.enter().append("circle")
                        .classed("node", true)
                        .attr("r", 5)
                        .style("opacity", 0.0)
                        .style("fill", "red")
                        .on("mouseover", function(d) {
                            loggedVisitToEntry(d)
                            centerOnClickedGraphNode(d.tweet)
                        });

                    enter.transition()
                        .duration(transition_time)
                        .attr("r", 12)
                        .style("opacity", 1.0)
                        .style("fill", function (d) {
                            return color(d.distance)
                        });


                    enter.call(force.drag)
                        .append("title")
                        .text(function (d) {
                            return d.tweet || "(no username)";
                        })
                        .on("mouseover", function(d) {
                        loggedDragVisitToEntry(d)
                        });

                    node.exit()
                        .transition()
                        .duration(transition_time)
                        .style("opacity", 0.0)
                        .attr("r", 0.0)
                        .style("fill", "black")
                        .remove();

                    force.nodes(graph.nodes)
                        .links(graph.edges)
                        .start();

                    force.on("tick", function () {
                        link.attr("x1", function (d) { return d.source.x; })
                            .attr("y1", function (d) { return d.source.y; })
                            .attr("x2", function (d) { return d.target.x; })
                            .attr("y2", function (d) { return d.target.y; });

                        node.attr("cx", function (d) { return d.x; })
                            .attr("cy", function (d) { return d.y; });
                    });
            } else {

                enter = node.enter()
                    .append("g")
                    .classed("node", true);

                enter.append("text")
                    .text(function (d) {
                        return d.tweet;
                    })


                    .datum(function (d) {
                        // Adjoin the bounding box to the element's bound data.
                        d.bbox = this.getBBox();
                    });

                enter.insert("rect", ":first-child")
                    .attr("width", function (d) { return d.bbox.width; })
                    .attr("height", function (d) { return d.bbox.height; })
                    .attr("y", function (d) { return -0.75 * d.bbox.height; })
                    .style("stroke", function (d) {
                        return color(d.distance);
                    })
                    .style("stroke-width", "2px")
                    .style("fill", "#e5e5e5")
                    .style("fill-opacity", 0.8)
                    .on("mouseover", function(d) {
                        loggedVisitToEntry(d)
                    });

                force.on("tick", function () {
                    link.attr("x1", function (d) { return d.source.x; })
                        .attr("y1", function (d) { return d.source.y; })
                        .attr("x2", function (d) { return d.target.x; })
                        .attr("y2", function (d) { return d.target.y; });

                    node.attr("transform", function (d) {
                        return "translate(" + d.x + ", " + d.y + ")";
                    });
                });
               force.linkDistance(100);
            }
            force.nodes(graph.nodes)
                .links(graph.edges)
                .start();

           // draw history graph
            drawHistoryChart(response.result.history,"#historychart1")
            drawHistoryChart(response.result.targetHistory,"#historychart2")

            enter.call(force.drag);

            node.exit()
                .transition()
                .duration(transition_time)
                .style("opacity", 0.0)
                .attr("r", 0.0)
                .style("fill", "black")
                .remove();


        }
    });
}

function advanceTimer() {
    "use strict";

    var value;

    value = twitter.date.slider("value") + 86400e3;
    twitter.date.slider("value", value);
    // log action
    twitter.ac.logUserActivity("timer control updated", "date/time change", twitter.ac.WF_GETDATA);
    updateGraph();
}

var timeout = null;
function toggleAnimation() {
    "use strict";

    var anim, update;
    // log action

    anim = d3.select("#animate");
    update = d3.select("#update");

    if (anim.text() === "Animate") {
        anim.text("Stop animation")
            .classed("btn-success", false)
            .classed("btn-warning", true);
        update.attr("disabled", true);
        twitter.ac.logUserActivity("user enabled animation", "animation", twitter.ac.WF_EXPLORE);

        // slowed down the animation from 1.5x to 3.0x 
        timeout = setInterval(advanceTimer, transition_time * 3.0);
    } else {
        anim.text("Animate")
            .classed("btn-success", true)
            .classed("brn-warning", false);
        update.attr("disabled", null);
        twitter.ac.logUserActivity("user disabled animation", "animation", twitter.ac.WF_EXPLORE);

        clearInterval(timeout);
    }
}

function twitterDistanceFunction( distance) {
        // make alternating blue and tan colors gradually fading to background to add color gradient to network
        // see http://en.wikipedia.org/wiki/Web_colors

        // for really far away distances, wrap the colors, avoid the red at the center.  This allows this algorithm to always
        // produce a cycle of acceptable colors
        if (distance > twitter.nodeColorArray.length-1)
                return twitter.nodeColorArray[(distance%(twitter.nodeColorArray.length-1))+1]
         else
                return twitter.nodeColorArray[distance]
}

window.onload = function () {
    "use strict";

    //tangelo.requireCompatibleVersion("0.2");
    //twitter.ac.logUILayout('Kitware Twiter Browsing', 'WindowOne', true, 1,1,1,1);

    // make the panel open & close over data content
    $('#control-panel').controlPanel()

    d3.json("defaults.json", function (err, defaults) {
        defaults = defaults || {};
        twitter.host = defaults.host || "localhost";

        svg = d3.select("svg");

        // 3/2014: changed link strength down from charge(-500), link(100) to charge(-2000)
        // to reduce the node overlap but still allow some node wandering animation without being too stiff

        // 6/2014: divided width/2 to move to left side and leave room for history charts

        width = $(window).width();
        height = $(window).height();
        force = d3.layout.force()
            .charge(-2000)
            .linkDistance(100)
            .gravity(0.2)
            .friction(0.6)
            .size([width/2, height]);

        //color = d3.scale.category20();
        color = twitterDistanceFunction;

        // Activate the jquery controls.
        twitter.date = $("#date");
        twitter.range = $("#range");
        twitter.center = $("#center");
        twitter.degree = $("#degree");
        twitter.history_length = $("#history_length");

        twitter.date.slider({
            //min: new Date("September 24, 2012").getTime(),
            //max: new Date("May 31, 2013").getTime(),
            //value: new Date("September 24, 2012").getTime(),
            min: new Date("March 3, 2014").getTime(),
            max: new Date("March 15, 2014").getTime(),
            value: new Date("March 3, 2014").getTime(),
            step: 86400,
            slide: function (evt, ui) {
                d3.select("#date-label")
                    .text(displayDate(new Date(ui.value)));
            },
            change: function (evt, ui) {
                d3.select("#date-label")
                    .text(displayDate(new Date(ui.value)));
            }
        });
        twitter.date.slider("value", twitter.date.slider("value"));

        twitter.range.slider({
            min: 1,
            max: 7,
            value: 1,
            slide: function (evt, ui) {
                d3.select("#range-label")
                    .text(ui.value + " day" + (ui.value === 1 ? "" : "s"));
            },
            change: function (evt, ui) {
                d3.select("#range-label")
                    .text(ui.value + " day" + (ui.value === 1 ? "" : "s"));
            }
        });
        twitter.range.slider("value", twitter.range.slider("value"));

        //twitter.center.val("rashidalfowzan")
        twitter.center.val("monica_nino")

        // clamp to 2 for South American dataset
        twitter.degree.spinner({
            min: 1,
            max: 2
        });
        twitter.degree.spinner("value", 1);

        // ---- setup controls for the history ------

        // define a slider that controls the length of the history records to display.  An ajax
        // call is made whenever the slider value is changed to update the logic in the 
        // python service that returns data for Vega rendering. 

        twitter.history_length.slider({
        min: 10,
        max: 50,
        value: 15,
        slide: function (evt, ui) {
            d3.select("#history_length-label")
                .text('show top '+ui.value+ ' tweeters');
        },
        change: function (evt, ui) {
            d3.select("history_length_label")
                .text(ui.value);
            updateHistoryLength();
            }
        });
        twitter.history_length.slider("value", twitter.history_length.slider("value"));

        d3.select("#update-history")
            .on("click", updateGraph);         

// --- end of history panel additions

        d3.select("#update")
            .on("click", updateGraph);

        d3.select("#animate")
            .on("click", toggleAnimation);

        d3.select("#clearSend")
            .on("click", clearHistoryCallback);

        // respond to the text label button being clicked
       d3.select("#usetext")
            .on("click", function () {
                d3.select("#nodes")
                    .selectAll("*")
                    .remove();

                d3.select("#links")
                    .selectAll("*")
                    .remove();

                twitter.textmode = !twitter.textmode;
                twitter.ac.logUserActivity("user toggled name display", "textmode", twitter.ac.WF_EXPLORE);
                updateGraph(true);
            });


        // respond to the allow click to cause follow operation being clicked
       d3.select("#clickfollow")
            .on("click", function () {
                twitter.clickCausesFollow = !twitter.clickCausesFollow;
                //console.log("clickfollow=",twitter.clickCausesFollow);
                twitter.ac.logUserActivity("user toggled click follow mode", "clickfollow", twitter.ac.WF_EXPLORE);
                // reload the graph with nodes that have or don't have events attached on them
                updateGraph();
            });   

        // block the contextmenu from coming up (often attached to right clicks). Since many 
        // of the right clicks will be on the graph, this has to be at the document level so newly
        // added graph nodes are all covered by this handler.

        $(document).bind('contextmenu', function(e){
            e.preventDefault();
            return false;
            })

        updateGraph();
    });
};

// this method is called when a user clicks on a node in the graph.  There is a mode where the
// user has elected to re-center around clicked nodes, and this can be enabled/disabled through
// a UI checkbox, so examine the state variable to decide if any action should be taken. This
// method is always called because callbacks are alwayw placed on the nodes. 

function centerOnClickedGraphNode(item) {
    if (twitter.clickCausesFollow==true) {
        console.log("centering on:",item)
          // assign the new center of the mentions graph
          twitter.center.val(item)
          // remove the previous graph
          d3.select("#nodes").selectAll("*").remove();
          d3.select("#links").selectAll("*").remove();
          // draw the new graph
          updateGraph()
      }
}



// ----------------- Vega history chart ---------------------------------------

// global values are updated during each rendering step
var rowdata;
var indexlist;
var minarray;
var maxarray;


function logClickOnHistoryEntry(item) {
        //console.log("click of entry for ",d.user)
        twitter.ac.logUserActivity("clicked history entity to center: "+item.text, "historySelect", twitter.ac.WF_EXPLORE);
}

function logMouseEnterOnHistoryTag(item){
      console.log("mouse enter of history for ",item.text)
      twitter.ac.logUserActivity("mouse enter (hover) for history entry for: "+item.text, "historyEnter", twitter.ac.WF_EXPLORE);
}

function logMouseExitOnHistoryTag(item){
      console.log("mouse exit of history for ",item.text)
      twitter.ac.logUserActivity("mouse exit (hover) for history entry for: "+item.text, "historyEnter", twitter.ac.WF_EXPLORE);
}

function centerOnClickedHistoryRecord(item) {
    //console.log("centering on:",item.text)
    logClickOnHistoryEntry(item)
      // assign the new center of the mentions graph
      twitter.center.val(item.text)
      // remove the previous graph
      d3.select("#nodes").selectAll("*").remove();
      d3.select("#links").selectAll("*").remove();
      // draw the new graph
      updateGraph(true)
}

 // bind data  with the vega spec.  We are also catching the mouse enter and mouse exit events on the
 // vega elements in order to generate instrumentation for the logging API.  The way the spec is currently
 // defined, there are rectangles and their are labels.  They are cousins, but we aren't sure how, so the 
 // mouse events tests if the text attribute is defined in order to only log events against the labels for now.

    function parseVegaSpec(spec, dynamicData, elem) {
            //console.log("parsing vega spec"); 
       vg.parse.spec(spec, function(chart) { 
            vegaview = chart({
                    el: elem, 
                    data: {rows: dynamicData.rowdata, index: dynamicData.indexlist}
                })
                .on("mouseover", function(event, item) {
                        if (typeof item.text != "undefined") {
                            logMouseEnterOnHistoryTag(item)
                        }
                })
                .on("mouseout", function(event, item) {
                        if (typeof item.text != "undefined") {
                            logMouseExitOnHistoryTag(item)
                        }                   
                 })
                .update()
                .on("click", function(event, item) { centerOnClickedHistoryRecord(item); }) ;
                 });
   }


function internalRedrawChart(elem) {
    var dynamData = {} 
    dynamData.rowdata = rowdata
    dynamData.indexlist = indexlist
    dynamData.minarray = minarray
    dynamData.maxarray = maxarray
    parseVegaSpec("./vegaBarChartSpec.json",dynamData,elem);
}

function updateHistoryLength(){
        data = {
            actionCommand: 'setHistoryDisplayLength',
            displayLength: parseInt(twitter.history_length.slider("value"))
        };
        console.log("history length in JS is",data.displayLength)
    $.ajax({
        url: "service/tweeters/" + twitter.host + "/xdata/twitter_mentions_v2",
        data: data,
        dataType: "json",
        success: function (response) {
            drawHistoryChart(response.result.history,"#historychart1")
            drawHistoryChart(response.result.targetHistory,"#historychart2")
        }
    });
}



function drawHistoryChart(data,elementToDraw) {
    "use strict";

    //console.log("data to chart:  ",data)

    rowdata = []
    indexlist = []
    var row = []
    minarray = []
    maxarray = []
    var thisval

    for (var i = 0; i < data.length; i++)
    {
        minarray[i] = 9e50
        maxarray[i] = 1e-50
        row = []
        // push the index, the name, and the quantity into a list.  When this was initially tested using in-memory
        // storage, the array indices were numeric, mongo return a JSON object, so pull out by field name.  Vega is 
        // passed an array like this : [ [ 0,'howdydoody',3], [ 0,'someone',10], [ 2,'someoneelse',6], ...]
        row.push(i)
        row.push(data[i]['tweeter'])  // push the name
        row.push(data[i]['quantity'])  // push the number of tweets
   
        if (data[i]['quantity'] < minarray[i]) { minarray[i] = data[i]['quantity']}
        if (data[i]['quantity'] > maxarray[i]) { maxarray[i] = data[i]['quantity']}
        rowdata.push(row)
        indexlist.push({index: i})
    }

    //console.log("rowdata=",rowdata)  
    internalRedrawChart(elementToDraw)
};

function clearHistoryCallback() {
    // the user has requested to clear the history charts, so make an ajax call to remove  entries from the history
     data = {
        actionCommand: 'clearHistory'
    };
      $.ajax({
        url: "service/tweeters/" + twitter.host + "/xdata/twitter_mentions",
        data: data,
        dataType: "json",
        success: function (response) {
            drawHistoryChart({},"#historychart1")
            drawHistoryChart({},"#historychart2")
        }
    });
}
