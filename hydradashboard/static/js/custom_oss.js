/**************************************************************************
 * File Name - custome_oss.js
 * Description - Contains function to plot pie, line and bar charts on OSS Screen
 * ---------------------Data Loaders function-------------------------------
 * 1) oss_LineBar_CpuMemoryUsage_Data(fsId, sDate, endDate, dataFunction, fetchMetrics, isZoom)
 * 2) oss_Area_ReadWrite_Data(fsId, sDate, endDate, dataFunction, targetKind, fetchMetrics, isZoom)
 * 3) loadOSSUsageSummary(fsId)
 * 4) initOSSPolling
******************************************************************************
 * API URL's for all the graphs on OSS dashboard page
******************************************************************************/
var oss_LineBar_CpuMemoryUsage_Data_Api_Url = "/api/get_stats_for_server/";
var oss_Area_ReadWrite_Data_Api_Url = "/api/get_fs_stats_for_targets/";
/******************************************************************************
 * Function for cpu and memory usage - Line + Column Chart
 * Param - File System name, start date, end date, datafunction (average/min/max),fetchematrics, isZoom
 * Return - Returns the graph plotted in container
*****************************************************************************/
oss_LineBar_CpuMemoryUsage_Data = function(hostId, sDate, endDate, dataFunction, fetchMetrics, isZoom)
{
  var count = 0;
  var cpuData = [],categories = [], memoryData = [];
  obj_oss_LineBar_CpuMemoryUsage_Data = JSON.parse(JSON.stringify(chartConfig_LineBar_CPUMemoryUsage));
  $.post(oss_LineBar_CpuMemoryUsage_Data_Api_Url,
  {
    datafunction: dataFunction, fetchmetrics: fetchMetrics, starttime: sDate, host_id: hostId, endtime: endDate
  })
  .success(function(data, textStatus, jqXHR) 
  {
    var hostName='';
    var ossCPUMemoryApiResponse = data;
    if(ossCPUMemoryApiResponse.success)
    {
      var response = ossCPUMemoryApiResponse.response;
      $.each(response, function(resKey, resValue) 
      {
        if(resValue.host != undefined)
        {
          if(resValue.cpu_usage != undefined || resValue.cpu_total != undefined)
          {
            ts = resValue.timestamp * 1000
            cpuData.push([ts,((resValue.cpu_usage*100)/resValue.cpu_total)]);
            memoryData.push([ts,(resValue.mem_MemTotal - resValue.mem_MemFree)]);
          }
        }
      });
    }
  })
  .error(function(event)
  {
    // Display of appropriate error message
  })
  .complete(function(event)
  {
    //obj_oss_LineBar_CpuMemoryUsage_Data.xAxis.categories = categories;
    obj_oss_LineBar_CpuMemoryUsage_Data.chart.renderTo = "oss_avgReadDiv";
    obj_oss_LineBar_CpuMemoryUsage_Data.chart.width='500';
    if(isZoom == 'true')
    {
      renderZoomDialog(obj_oss_LineBar_CpuMemoryUsage_Data);
    }

    obj_oss_LineBar_CpuMemoryUsage_Data.series[0].data = cpuData;
    obj_oss_LineBar_CpuMemoryUsage_Data.series[1].data = memoryData;

    chart = new Highcharts.Chart(obj_oss_LineBar_CpuMemoryUsage_Data);
  });
}
/*****************************************************************************
 * Function for disk read and write - Area Chart
 * Param - File System name, start date, end date, datafunction (average/min/max), targetkind , fetchematrics, isZoom
 * Return - Returns the graph plotted in container
*****************************************************************************/
oss_Area_ReadWrite_Data = function(fsId, sDate, endDate, dataFunction, targetKind, fetchMetrics, isZoom)
{
  obj_oss_Area_ReadWrite_Data = JSON.parse(JSON.stringify(chartConfig_Area_ReadWrite));
  var values = new Object();
  var stats = readWriteFetchMatric;
  $.each(stats, function(i, stat_name)
  {
    values[stat_name] = [];
  });
  $.post(oss_Area_ReadWrite_Data_Api_Url,
  {
    targetkind: targetKind, datafunction: dataFunction, fetchmetrics: stats.join(" "),
	  starttime: startTime, filesystem_id: fsId, endtime: endTime
	})
  .success(function(data, textStatus, jqXHR) 
  {
    var hostName='';
    var avgMemoryApiResponse = data;
    if(avgMemoryApiResponse.success)
    {
      var response = avgMemoryApiResponse.response;
      $.each(response, function(resKey, resValue)
      {
        if(resValue.filesystem != undefined)
        {
          if (resValue.stats_read_bytes != undefined || resValue.stats_write_bytes != undefined)
          { 
            ts = resValue.timestamp * 1000;
            $.each(stats, function(i, stat_name) 
            {
              if(resValue[stat_name] != null || resValue[stat_name] != undefined) 
              {
                if (i <= 0)
                { 
                  values[stat_name].push([ts, resValue[stat_name]]);
                } 
                else
                {
                  values[stat_name].push([ts, (0 - resValue[stat_name])]);    
                }
              }
	          });
	        }
	      }
	    });
	  }
	 })
	 .error(function(event) 
	 {
	   // Display of appropriate error message
	 })
  .complete(function(event)
  {
    obj_oss_Area_ReadWrite_Data.chart.renderTo = "oss_avgWriteDiv";
    obj_oss_Area_ReadWrite_Data.chart.width='500';
    $.each(stats, function(i, stat_name) 
    {
      obj_oss_Area_ReadWrite_Data.series[i].data = values[stat_name];
    });
    if(isZoom == 'true')
    {
      renderZoomDialog(obj_oss_Area_ReadWrite_Data);
    }
    chart = new Highcharts.Chart(obj_oss_Area_ReadWrite_Data);
  });
}
/*****************************************************************************
 * Function to load OSS usage summary information
 * Param - File System Id
 * Return - Returns the summary information of the selected file system
*****************************************************************************/
loadOSSUsageSummary = function (fsId)
{
  $('#ossSummaryTbl').html("<tr><td width='100%' align='center' height='180px'><img src='/static/images/loading.gif' style='margin-top:10px;margin-bottom:10px' width='16' height='16' /></td></tr>");
  var innerContent = "";
  $.post("/api/getfilesystem/",{filesystem_id: fsId})
  .success(function(data, textStatus, jqXHR) 
  {
    if(data.success)
    {
      var response = data.response;
      $.each(response, function(resKey, resValue) 
      {
        innerContent = innerContent + 
        "<tr><td class='greybgcol'>MGS :</td><td class='tblContent greybgcol'>"+resValue.mgs_hostname+"</td><td>&nbsp;</td><td>&nbsp;</td></tr>"+
        "<tr><td class='greybgcol'>MDS :</td><td class='tblContent greybgcol'>"+resValue.mds_hostname+"</td><td class='greybgcol'>Failover:</td><td class='tblContent greybgcol'>NA</td></tr>"+
        "<tr><td class='greybgcol'>File System :</td><td class='tblContent greybgcol'>"+resValue.fsname+"</td><td>&nbsp;</td><td>&nbsp;</td></tr>"+
        "<tr><td class='greybgcol'>Total Capacity: </td><td class='tblContent greybgcol'>"+resValue.kbytesused+" </td><td class='greybgcol'>Total Free:</td><td class='tblContent greybgcol'>"+resValue.kbytesfree+"</td></tr>"+
        "<tr><td class='greybgcol'>Files Total: </td><td class='tblContent greybgcol'>"+resValue.filestotal+" </td><td class='greybgcol'>Files Free:</td><td class='tblContent greybgcol'>"+resValue.filesfree+"</td></tr>"+
        "<tr><td class='greybgcol'>Standby OSS :</td><td class='tblContent greybgcol'>--</td><td>&nbsp;</td><td>&nbsp;</td></tr>"+
        "<tr><td class='greybgcol'>Total OSTs:</td><td class='tblContent greybgcol'>"+resValue.noofost+" </td><td>&nbsp;</td><td>&nbsp;</td></tr>"+
        "<tr><td class='greybgcol'>Status:</td>";

        if(resValue.status == "OK" || resValue.status == "STARTED")
        {
          innerContent = innerContent + "<td><div class='tblContent txtleft status_ok'>"+resValue.status+"<div></td><td>&nbsp;</td><td>&nbsp;</td></tr>";
        }
        else if(resValue.status == "WARNING" || resValue.status == "RECOVERY")
        {
          innerContent = innerContent + "<td><div class='tblContent txtleft status_warning'>"+resValue.status+"</div></td><td>&nbsp;</td><td>&nbsp;</td></tr>";
        }
        else if(resValue.status == "STOPPED")
        {
          innerContent = innerContent + "<td><div class='tblContent txtleft status_stopped'>"+resValue.status+"</div></td><td>&nbsp;</td><td>&nbsp;</td></tr>";
        }
      });
    }
  })
	.error(function(event) 
	{
	  
	})
	.complete(function(event)
	{
	  $('#ossSummaryTbl').html(innerContent);
  });
}
/*****************************************************************************
 * Function to initialize polling of graphs on the oss dashboard page
*****************************************************************************/
initOSSPolling = function()
{
  if(isPollingFlag)
  {
    ossPollingInterval = self.setInterval(function()
    {
      oss_LineBar_CpuMemoryUsage_Data($('#ls_ossId').val(), startTime, endTime, "Average", cpuMemoryFetchMatric, "false");
      oss_Area_ReadWrite_Data($('#ls_fsId').val(), startTime, endTime, "Average", "OST", readWriteFetchMatric, "false");
    }, 10000);
  }
  else
  {
    oss_LineBar_CpuMemoryUsage_Data($('#ls_ossId').val(), startTime, endTime, "Average", cpuMemoryFetchMatric, "false");
    oss_Area_ReadWrite_Data($('#ls_fsId').val(), startTime, endTime, "Average", "OST", readWriteFetchMatric, "false");
  }
}
/******************************************************************************
 * Function to show OST dashboard content
******************************************************************************/
function showOSSDashboard()
{
  loadOSSContent($('#ls_fsId').val(), $('#ls_fsName').val(), $('#ls_ossId').val(), $('#ls_ossName').val());
}
/*********************************************************************************************/
