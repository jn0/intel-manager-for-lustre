
/* notifications: poll the API for new Jobs/Alerts/Events and 
 * trigger jGrowl UI */

var last_check = page_load_time;
var poll_period = 1000;
var error_retry_period = 10000;

var known_jobs = {};
var running_job_count = 0;
var running_jobs = {}

var read_locks = {}
var write_locks = {}

var known_alerts = {};
var active_alert_count = 0;
var active_alerts = {}

function debug(msg) {
  //console.log(msg);
}

update_sidebar_icons = function() {
  if (running_job_count > 0) {
    $('#notification_icon_jobs').show()
    $('#notification_icon_jobs').attr('title', running_job_count + " jobs running")
  } else {
    $('#notification_icon_jobs').hide()
    $('#notification_icon_jobs').attr('title', '');
  }

  if (active_alert_count > 0) {
    $('#notification_icon_alerts').show()
    $('#notification_icon_alerts').attr('title', active_alert_count + " alerts active")
  } else {
    $('#notification_icon_alerts').hide()
    $('#notification_icon_alerts').attr('title', '');
  }
}

activate_alert = function(alert_info) {
  if (active_alerts[alert_info.id]) {
    throw "Alert " + alert_info.id + " activated twice"
  }

  active_alerts[alert_info.id] = alert_info
  active_alert_count += 1;
}

deactivate_alert = function(alert_info) {
  if (active_alerts[alert_info.id] == null) {
    throw "Alert " + alert_info.id + " finished but not in active_alerts"
  }

  delete active_alerts[alert_info.id]
  active_alert_count -= 1;
}





start_running = function(job_info) {
  if (running_jobs[job_info.id]) {
    throw "Job " + job_info.id + " started twice"
  }
  debug('start_running: ' + job_info.id);

  running_jobs[job_info.id] = job_info
  running_job_count += 1;

  var keys = {};
  $.each(job_info.read_locks, function(i, lock) {
    var key = [lock.locked_item_id, lock.locked_item_content_type_id];
    debug('start_running: read lock ' + key)
    if (!read_locks[key]) {
      read_locks[key] = {}
    }
    read_locks[key][job_info.id] = 1

    keys[key] = 0;
  });
  $.each(job_info.write_locks, function(i, lock) {
    var key = [lock.locked_item_id, lock.locked_item_content_type_id];
    debug('start_running: write lock ' + key)
    if (!write_locks[key]) {
      write_locks[key] = {}
    }
    write_locks[key][job_info.id] = 1
    keys[key] = 0;
  });

  debug("keys:");
  debug(keys);
  $.each(keys, function(key, x) {
    key = key.split(",")
    debug('selector: ' + '.notification_object_id_' + key[0] + '_' + key[1])
    $('.notification_object_id_' + key[0] + '_' + key[1]).each(function() {
      notification_update_icon(key, $(this));
    });
  });

  debug("start_running: leaving running_jobs state:");
  debug(running_jobs);
  debug(write_locks);
  debug(read_locks);
}

finish_running = function(job_info) {
  if (running_jobs[job_info.id] == null) {
    throw "Job " + job_info.id + " finished but not in running_jobs"
  }

  debug('finish_running: ' + job_info.id);

  debug("ALPHA: leaving running_jobs state:");
  debug(running_jobs);

  delete running_jobs[job_info.id]

  debug("ZULU: leaving running_jobs state:");
  debug(running_jobs);

  running_job_count -= 1;

  var keys = {};
  $.each(job_info.read_locks, function(i, lock) {
    var key = [lock.locked_item_id, lock.locked_item_content_type_id];
    debug('finish_running: read lock ' + key)
    delete read_locks[key][job_info.id]

    keys[key] = 0;
  });
  $.each(job_info.write_locks, function(i, lock) {
    var key = [lock.locked_item_id, lock.locked_item_content_type_id];
    debug('finish_running: write lock ' + key)
    delete write_locks[key][job_info.id]

    keys[key] = 0;
  });

  $.each(keys, function(key, x) {
    key = key.split(",")
    $('.notification_object_id_' + key[0] + '_' + key[1]).each(function() {
      notification_update_icon(key, $(this));
    });
  });

  debug("finish_running: leaving running_jobs state:");
  debug(running_jobs);
}

attr_count = function(obj) {
  var count = 0;
  for (var k in obj) {
    if (obj.hasOwnProperty(k)) {
      ++count;
    }
  }
  return count;
}

notification_update_icon = function(key, element) {
  debug("notification_update_icon:")
  debug(key)
  debug(element)
  var obj_read_locks = read_locks[key]
  var obj_write_locks = write_locks[key]
  if (obj_write_locks && attr_count(obj_write_locks) > 0) {
    element.show();
    element.addClass('busy_icon');
    var tooltip = "Ongoing operations: "
    debug(obj_write_locks)
    $.each(obj_write_locks, function(job_id, x) {
      job = known_jobs[job_id]
      if (!job) {
        throw "Job " + job_id + " not found!"
      }
      tooltip += " " + job.description;
    });
    element.attr('title', tooltip);
  } else if (obj_read_locks && attr_count(obj_read_locks) > 0) {
    element.show();
    element.addClass('locked_icon');
    var tooltip = "Locked by pending operations:"
    debug(obj_read_locks);
    $.each(obj_read_locks, function(job_id, x) {
      job = known_jobs[job_id]
      if (!job) {
        throw "Job " + job_id + " not found!"
      }
      tooltip += " " + job.description;
    });
    element.attr('title', tooltip);
  } else {
    element.removeClass('locked_icon');
    element.removeClass('busy_icon');
    element.attr('title', "");
  }
}

notification_update_icons = function() {
  $('.notification_object_icon').each( function() {
    var icon_element = $(this);
    $.each($(this).attr('class').split(" "), function(i, class_name) {
      if (class_name.indexOf('notification_object_id_') == 0) {
        var parts = class_name.split("_")
        var key = [parts[3], parts[4]];
        notification_update_icon(key, icon_element);
      }
    });
  });
}


update_objects = function(data, silent) {
  $.each(data.response.jobs, function(i, job_info) {
    existing = known_jobs[job_info.id]
    known_jobs[job_info.id] = job_info

    if (data.response.last_modified) {
      last_check = data.response.last_modified;
    }

    function completion_jgrowl_args(info) {
      if (job_info.cancelled) {
        return {header: "Job cancelled", theme: 'job_cancelled'}
      } else if (job_info.errored) {
        return {header: "Job failed", theme: 'job_errored'}
      } else {
        return {header: "Job complete", theme: 'job_success'}
      }
    }

    // Map backend states to a simple
    //  * pending
    //  * running
    //  * complete
    function simple_state(backend_state) {
      if (backend_state == 'pending') {
        return 'pending';
      } else if (backend_state == 'tasked' || backend_state == 'completing' || backend_state == 'cancelling' || backend_state == 'paused' || backend_state == 'tasking') {
        return 'running';
      } else if (backend_state == 'complete') {
        return 'complete';
      } else {
        throw "Unknown job state '" + backend_state + "'";
      }
    }

    var state = simple_state(job_info.state)

    var notify = false;
    var args;
    if (existing == null) {
      if (state != 'complete') {
        start_running(job_info)
      }

      if (state == 'running') {
        notify = true;
        args = {header: "Job started"};
      } else if (state == 'complete') {
        notify = true;
        args = completion_jgrowl_args(job_info);
      }
    } else {
      var old_state = simple_state(existing.state)
      if (state == 'complete' && old_state != 'complete') {
        finish_running(job_info);

        notify = true;
        args = completion_jgrowl_args(job_info);
      } else if (state == 'running' && old_state != 'running') {
        notify = true;
        args = {header: "Job started"};
      }
    }

    if (notify && !silent) {
      $.jGrowl(job_info.description, args);
    }
  });

  console.log(data.response.alerts);
  $.each(data.response.alerts, function(i, alert_info) {
    existing = known_alerts[alert_info.id]
    known_alerts[alert_info.id] = alert_info

    var notify = false;
    var jgrowl_args;
    if (existing == null) {
      if (alert_info.active) {
        notify = true
        jgrowl_args = {header: "Alert raised", theme: 'alert_raised'}
        activate_alert(alert_info);
      } else {
        /* Learned about a new alert after it had already
         * been raised and lowered */
        notify = true
        jgrowl_args = {header: "Alert cleared"}
      }
    } else {
      if (alert_info.active == false && existing.active == true) {
        notify = true
        jgrowl_args = {header: "Alert cleared"}
      }
    }
    if (notify && !silent) {
      $.jGrowl(alert_info.message, jgrowl_args);
    }
  });
}

poll_jobs = function() {
  /* FIXME: using POST instead of GET because otherwise jQuery forces the JSON payload to
   * be urlencoded and django-piston doesn't get our args out properly */
  $.ajax({type: 'POST', url: "/api/jobs/", dataType: 'json', data: JSON.stringify({filter_opts: {since_time: last_check, initial: false}}), contentType:"application/json; charset=utf-8"})
  .success(function(data, textStatus, jqXHR) {
    if (!data.success) {
      debug("Error calling jobs_since")
      setTimeout(poll_jobs, error_retry_period);
      return;
    }

    update_objects(data);
    update_sidebar_icons();

    setTimeout(poll_jobs, poll_period);
  })
}

$(document).ready(function() {

  $.ajax({type: 'POST', url: "/api/jobs/", dataType: 'json', data: JSON.stringify({filter_opts: {since_time: "", initial: true}}), contentType:"application/json; charset=utf-8"})
  .success(function(data, textStatus, jqXHR) {
    if (data.success) {
      update_objects(data, silent = true);
      update_sidebar_icons();
      setTimeout(poll_jobs, poll_period);
    }
  });
});

