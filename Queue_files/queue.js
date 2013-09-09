// Register a CSS handler to get a random image from the slideshow.
jQuery.jQueryRandom = 0;
jQuery.extend(jQuery.expr[":"],
{
   random: function(a, i, m, r) {
       if (i == 0) {
           jQuery.jQueryRandom = Math.floor(Math.random() * r.length);
       };
       return i == jQuery.jQueryRandom;
   }
});

// Handlebars helpers
Handlebars.registerHelper('if_gt', function(context, options) {
    if (context > options.hash.compare) {
        return options.fn(this);
    }
    return options.inverse(this);
});

// Switch the pictures in the slideshow.
function slideSwitch() {
   var active = jQuery('.slideshow img.active');
   if ( active.length == 0 ) active = jQuery('.slideshow IMG:random');
   var next =  active.next().length ? active.next()
       : jQuery('.slideshow img:first');
   active.addClass('last-active');
   next.css({opacity: 0.0})
       .addClass('active')
       .animate({opacity: 1.0}, 1000, function() {
           active.removeClass('active last-active');
       });
}

// Select a random image and start the slideshow.
jQuery(function() {
   jQuery('.slideshow IMG:random').addClass('active');
   setInterval( "slideSwitch()", 6000 );
});

// This is set to true after the initial setup of the page has ran.
pageInitialised = false;
queue_token = null;
$.ajaxSetup({timeout: 60000});

// Return the GA marker from the currently active template.
function gaMarker() {
    lines = $('#textcontent').html().split('\n');
    for (i=0; i<lines.length; i++) {
        if (lines[i].indexOf('ga_marker') >= 0) {
            return /<!--\[ga_marker\](.*?)-->/.exec(lines[i])[1];
        }
    }
}

// Initialise the page when the first API call is done.
function initialisePage(data) {
    if (data['vars']['0_start_date_javascript']) {
        refreshAtDate(new Date(data['vars']['0_start_date_javascript']));
    }
    if (data['vars']['start_date_javascript']) {
        refreshAtDate(new Date(data['vars']['start_date_javascript']));
    }
    pageInitialised = true;
}

// Render the correct template according to the sys_vars.template_name.
// When `open` is set the template for the open queue is rendered.
function renderTemplate(data, open) {
    var template_name = data['sys_vars']['template_name'];
    if (open && data['sys_vars']['open_template_name']) {
        template_name = data['sys_vars']['open_template_name'];
    }
    var source = $("#" + template_name + "-template").html();
    var template = Handlebars.compile(source);
    $('#textcontent-fade').html(template(data)).fadeIn(2000);
    $('#textcontent').fadeOut(2000, function() {
            $('#textcontent').html($('#textcontent-fade').html()).show(0)
            $('#textcontent-fade').hide(0);
            sendGAPage(data);
    });


}

// Send page information to GA if the template or the mode have changed.
function sendGAPage(data) {
    if (last_version != data['version']) {
        try {
            var page = data['vars']['event_title'] + "/" + gaMarker();
            if (data['vars']['event_tracker_id']) {
                _gaq.push(['event._trackPageview', page ]);
            }
            _gaq.push(['paylogic._trackPageview', page ]);
            last_version = data['version'];
        }
        catch(exception) {}
    }
}

// Send JSON loading time information.
function sendGATiming(updateStart, label) {
    try {
            _gaq.push(['paylogic._trackTiming',
                    'Permanent Queue',
                    'AJAX Update',
                    new Date().getTime() - updateStart,
                    label,
                    20]);
    }
    catch(exception) {}
}

// Load the frontoffice in the iframe.
function loadFrontoffice(url) {
    $('#paylogic-frontoffice').attr('src', url)
    .load(showFrontoffice);
}

// Make the frontoffice iframe visible and hide the queue elements.
function showFrontoffice() {
    $('#paylogic-frontoffice').fadeIn('slow', function() {
        $('#balls').fadeOut('slow');
        $('#container').fadeOut('slow');
        $('#footer').fadeOut('slow');
        $('#slideshow').fadeOut('slow', function() {
            $('#slideshow').remove();
        });
    });
}

// Trigger the javascript refresh
function doRefresh() {
    $('#updating_waiting_time').fadeIn();
    var updateStart = new Date().getTime();
    var tryAgain = function() {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = setTimeout(doRefresh, 10000);
    };
    var doUpdate = function(data) {
        try {
            $('#updating_waiting_time').fadeOut();
            if ($.isEmptyObject(data)) {
                sendGATiming(updateStart, 'no data');
                tryAgain();
            } else {
                _latest_queue_data = data;
                if (data['redirect']) {
                    // Went through the queue
                    sendGATiming(updateStart, 'redirect');
                    setToken('');
                    loadFrontoffice(data['redirect']);
                } else {
                    sendGATiming(updateStart, 'success')
                    if (!pageInitialised) {
                        initialisePage(data);
                    }
                    if (data['sys_vars'].hasOwnProperty('token')) {
                        setToken(data['sys_vars']['token']);
                    }
                    renderTemplate(data);
                    var seconds = data['sys_vars']['refresh_seconds'] || 120;
                    clearTimeout(retryTimeoutId);
                    retryTimeoutId = setTimeout(doRefresh, seconds * 1000);
                }
            }
        }
        catch(exception) {
            tryAgain();
        }
    };
    var arguments = {
        now: new Date().getTime()
    };
    var token = getToken();
    if (token) {
        arguments.token = token;
    }
    $.getJSON(refresh_url_json + "?jsoncallback=?", arguments).success(doUpdate).error(function() {
        sendGATiming(updateStart, 'failed');
        tryAgain();
    });
}

// Store the token in a cookie and keep it in a global variable.
function setToken(token) {
    queue_token = token
        var expires = new Date();
    expires.setMinutes(expires.getMinutes() + 10);
    document.cookie = "token=" + token + '; expires=' + expires.toUTCString();
    if (!getToken()) {
        // Cookies are disabled try a session cookie.
        document.cookie = "token=" + token;
    }
};

// Get the token from the cookie, fallback to the global variable.
function getToken() {
    var cookies = document.cookie.split(';');
    for (var i = 0, l = cookies.length; i < l; i++) {
        var cookie = cookies[i];
        var name = cookie.substr(0, cookie.indexOf('='));
        if (name.replace(/ /g, '') == 'token') {
            return cookie.substr(cookie.indexOf('=') + 1)
        }
    }
    return queue_token;
};

// Sets a timeout that will refresh at a certain date.
function refreshAtDate(open_date) {
    var current_date = new Date();
    var refresh_wait = open_date.getTime() - current_date.getTime();
    if (refresh_wait > 0) {
        setTimeout(function() {
            renderTemplate(_latest_queue_data, true);
            }, refresh_wait);
        token_wait = refresh_wait + Math.round(Math.random() * 60000);
        setTimeout(doRefresh, token_wait);
    }
}

// Initialise the page.
jQuery(function() {
    window.onerror = function() {
        setTimeout(function() {window.location.reload();}, 120 * 1000);
    };
    // Set some global state.
    retryTimeoutId = null;
    last_version = null;
    // initialise the JSON url to the page location.
    refresh_url_json = 'http://' + queue_api_domain + '/json/' + paylogic_event_id + '/' + paylogic_point_of_sale_id + '/';
    setTimeout(doRefresh, 5000);
});

