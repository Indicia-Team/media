  /**
 * Taxon Tree Viewer
 * =================
 *
 * Provides the client-side functionality for displaying and searching
 * a hierarchical taxonomic tree using the jsTree library.
 *
 * Features
 * --------
 * - Lazy loading of child taxa via AJAX requests.
 * - Dynamic retrieval of tree nodes from the Taxon Tree controller.
 * - Client-side search with delayed execution to reduce server load.
 * - Support for switching between taxon lists using the
 *   ``taxon_list_id`` parameter.
 *
 * Data Source
 * -----------
 * Tree data is retrieved from the following endpoint:
 *
 *     /index.php/taxontree_operation/tree/{parent_id}/{taxon_list_id}
 *
 * Where:
 *
 * - ``parent_id`` is the taxon list identifier of the parent node.
 * - ``taxon_list_id`` is the taxon list being browsed.
 * - A ``parent_id`` value of ``0`` requests the root nodes.
 *
 * Dependencies
 * ------------
 * - jQuery
 * - jsTree (https://www.jstree.com/)
 *
 * HTML Requirements
 * -----------------
 *
 * The page must contain:
 *
 *     <input id="tree-search" type="text">
 *     <div id="taxon-tree"></div>
 *
 * The following global JavaScript variables are also expected:
 *
 * - ``window.baseUrl`` : Base URL of the Warehouse installation.
 * - ``taxon_list_id``  : Taxon list identifier to display.
 *
 * Search Behaviour
 * ----------------
 *
 * Searches are delayed by 250 milliseconds after the user stops typing.
 * This prevents excessive search requests being triggered during rapid
 * text entry.
 *
 * Author
 * ------
 * UK Species Inventory / Taxon Tree Operations Module
 */
  

  var esEnabled = false;

 /**
 * Initialise the taxonomic tree.
 * ==============================
 *
 * Creates a jsTree instance bound to the ``#taxon-tree`` element and
 * configures lazy loading of taxon nodes via AJAX requests to the
 * Taxon Tree controller.
 *
 * The currently displayed taxon list is determined by the global
 * ``taxon_list_id`` variable. All node requests include this value
 * so that the tree displays taxa from the selected list.
 *
 * Data Source
 * -----------
 *
 * Tree nodes are retrieved from:
 *
 *     /index.php/taxontree_operation/tree/{parent_id}/{taxon_list_id}
 *
 * Where:
 *
 * - ``parent_id`` is the parent taxon identifier.
 * - ``taxon_list_id`` is the selected taxon list.
 * - A ``parent_id`` value of ``0`` requests the root nodes.
 *
 * Dependencies
 * ------------
 *
 * - jQuery
 * - jsTree
 * - ``window.baseUrl``
 * - ``taxon_list_id``
 * - ``#taxon-tree`` HTML element
 *
 * Behaviour
 * ---------
 *
 * - Destroys any existing jsTree instance.
 * - Creates a new tree using the current taxon list.
 * - Loads child nodes on demand.
 * - Enables the jsTree search plugin.
 * - Logs AJAX requests and returned data to the browser console.
 *
 * @function initialiseTaxonTree
 * @returns {void}
 */
function initialiseTaxonTree() {

  if ($.jstree.reference('#taxon-tree')) {
    $('#taxon-tree').jstree('destroy');
  }

  $('#taxon-tree').jstree({
    plugins: ['search','sort' ],      // ,'contextmenu'
    core: {
      data: function(node, callback) {

        var url;

        if (node.id === '#') {
          url = window.baseUrl +
            'index.php/taxontree_operation/tree/0/' +
            taxon_list_id;
        } else {
          url = window.baseUrl +
            'index.php/taxontree_operation/tree/' +
            node.id +
            '/' +
            taxon_list_id;
        }

        $.getJSON(url, function(data) {

          callback(data);
        });

      }
    }
  });

}



/**
 * Load taxon lists into the selector.
 * ===================================
 *
 * Retrieves the list of available taxon lists from the
 * Taxon Tree controller and populates the taxon list
 * selection control.
 *
 * The currently selected taxon list is determined by the
 * global ``taxon_list_id`` variable. If a returned taxon
 * list identifier matches this value, the corresponding
 * option is automatically selected.
 *
 * Data Source
 * -----------
 *
 * Taxon lists are retrieved from:
 *
 *     /index.php/taxontree_operation/taxonlists
 *
 * Expected JSON format:
 *
 * .. code-block:: json
 *
 *     [
 *       {
 *         "id": 15,
 *         "title": "UK Species Inventory"
 *       }
 *     ]
 *
 * Dependencies
 * ------------
 *
 * - jQuery
 * - ``window.baseUrl``
 * - ``taxon_list_id``
 * - ``#taxon-list-select`` HTML select element
 *
 * Behaviour
 * ---------
 *
 * - Removes any existing options from the selector.
 * - Adds an option for each taxon list returned by the server.
 * - Marks the option matching ``taxon_list_id`` as selected.
 * - Logs an error to the browser console if the request fails.
 *
 * @function loadTaxonLists
 * @returns {void}
 */
function loadTaxonLists() {

  var url = window.baseUrl + 'index.php/taxontree_operation/taxonlists';

  $.getJSON(url, function(data) {

    var $select = $('#taxon-list-select');

    $select.empty();

    $.each(data, function(i, item) {

      var $option = $('<option>', {
        value: item.id,
        text: item.title
      });

      if (parseInt(item.id, 10) === parseInt(taxon_list_id, 10)) {
        $option.prop('selected', true);
      }

      $select.append($option);

    });

  }).fail(function(xhr, status, error) {
    console.error('Failed to load taxon lists:', error);
  });

}



/**
 * Load taxon list information.
 * ===========================
 *
 * Retrieves summary information for the currently selected taxon list
 * and displays it in the taxon list information panel.
 *
 * Data Source
 * -----------
 *
 * Taxon list metadata is retrieved from:
 *
 *     /index.php/taxontree_operation/info/{taxon_list_id}
 *
 * Expected JSON format:
 *
 * .. code-block:: json
 *
 *     {
 *       "last_updated": "2026-10-13 10:15:42",
 *       "count": 123456,
 *       "taxon_list_id": 15
 *     }
 *
 * Dependencies
 * ------------
 *
 * - jQuery
 * - ``window.baseUrl``
 * - ``taxon_list_id``
 * - ``#taxon-list-info`` HTML element
 *
 * Behaviour
 * ---------
 *
 * - Retrieves summary information for the selected taxon list.
 * - Displays the taxon list id.
 * - Displays the number of taxa in the list.
 * - Displays the most recent update date.
 * - Replaces any existing content in the information panel.
 *
 * @function loadTaxonListInfo
 * @returns {void}
 */
function loadTaxonListInfo() {

  var url = window.baseUrl +
    'index.php/taxontree_operation/info/' +
    taxon_list_id;

  $.getJSON(url, function(data) {

    var html =
      '<div class="panel panel-default">' +
        '<div class="panel-heading">' +
          '<strong>Taxon List Information</strong>' +
        '</div>' +
        '<div class="panel-body">' +
          '<p><strong>List ID:</strong> ' + data.taxon_list_id + '</p>' +
          '<p><strong>Taxa:</strong> ' + Number(data.count).toLocaleString() + '</p>' +
          '<p><strong>Last Updated:</strong> ' + data.last_updated + '</p>' +
        '</div>' +
      '</div>';

    $('#taxon-list-info').html(html);

  }).fail(function(xhr, status, error) {

    $('#taxon-list-info').html(
      '<div class="alert alert-danger">' +
      'Failed to load taxon list information.' +
      '</div>'
    );

    console.error(error);

  });

}

/**
 * Initialise tree search.
 * =======================
 *
 * Adds delayed searching to the taxonomic tree. Searches are
 * performed 250 milliseconds after the user stops typing.
 *
 * @function initialiseTreeSearch
 * @returns {void}
 */
function initialiseTreeSearch() {

  var to = false;

  $('#tree-search').keyup(function() {

    if (to) {
      clearTimeout(to);
    }

    to = setTimeout(function() {

      var v = $('#tree-search').val();

      searchTaxa(v);

      $('#taxon-tree').jstree(true).search(v);

    }, 250);

  });

}

function searchTaxa(taxon) {
  var url = window.baseUrl +
    'index.php/taxontree_operation/search/'; 

    $.post(url,{
          taxon: taxon,
          taxon_list_id: taxon_list_id
    }, function(data) {   
          displaySearchResults(data);
    });

}

function displaySearchResults(results) {

  var html = '<div class="list-group">';

  $.each(results.data, function(i, taxon) {

    html +=
      '<a href="#" ' +
      'class="list-group-item search-result" ' +
      'data-meaning-id="' + taxon.taxon_meaning_id + '" ' +
      'data-path="' + taxon.path + '">' +
      taxon.taxon +
      '</a>';

  });

  html += '</div>';

    $('#search-results')
    .html(html);

    $('#toggle-search-results').show();
}

$(document).on('click', '.search-result', function(e) {
    e.preventDefault();

      var tree = $('#taxon-tree').jstree(true);

      tree.deselect_all();
      tree.close_all();

    var taxonMeaningId = $(this).data('meaning-id');
    var path = $(this).data('path');

    openTaxonPath(path);

    var tree = $('#taxon-tree').jstree(true);

    $('#toggle-search-results').show();

    loadTaxonDetails(taxonMeaningId, taxon_list_id);
});

$(document).on('click', '#toggle-search-results', function () {
    toggleSearch();
});


function toggleSearch() {

  $('#search-results').toggle();

  var visible = $('#search-results').is(':visible');

  $('#toggle-search-results .glyphicon')
    .toggleClass('glyphicon-chevron-up', visible)
    .toggleClass('glyphicon-chevron-down', !visible);
}


function openTaxonPath(path) {

    if (typeof path === 'string') {
        path = path.split(',').map(Number);
    }

    currentIndex = 0;

    var tree = $('#taxon-tree').jstree(true);

      $('#taxon-tree')
        .off('after_open.jstree.openPath')
        .on('after_open.jstree.openPath', function (e, data) {

            if ( data.node.id !== String(path[currentIndex]) ) {
                return;
            }

            currentIndex++;

            if (currentIndex < path.length) {
                tree.open_node(path[currentIndex]);
            } else {
                tree.select_node(path[path.length - 1]);
                $('#taxon-tree').off('after_open.jstree.openPath');
            }

          });

    tree.open_node(path[currentIndex]);

  }

/**
 * Load taxon details.
 * ==================
 *
 * Retrieves all names associated with a taxon meaning within the
 * selected taxon list and displays them in the taxon details panel.
 *
 * @param {number} meaningId Taxon meaning identifier.
 * @returns {void}
 */
function loadTaxonDetails(meaningId,taxon_list_id) {

  var url = window.baseUrl +
    'index.php/taxontree_operation/details/' +
    meaningId +
    '/' +
    taxon_list_id;

  $.getJSON(url, function(data) {
    var html = ' <strong>Occurrence count:</strong> '+data.occurrence_count;

    var minDate='';
    var maxDate=''

    if (data.min_date && data.min_date.length>9) {
     var minDate = data.min_date.substr(0,10);     
    }

    if (data.max_date && data.max_date.length>9) {
      var maxDate = data.max_date.substr(0,10);
    }


    html += ' <strong>First recorded</strong>: '+minDate+' <strong>Last recorded</strong>: '+maxDate;
    html += '<br/>'+data.taxon_path.join(' > ');
    
    html += '<br/><div id="details"><div class="row" ><div class="col-md-12" >';

    if (data.groups && data.groups.length > 0) {
      $.each(data.groups, function(i, group) {
        html += ' <span class="label label-info">' + group.title + '</span>';
      });
    }

    if (data.designations && data.designations.length > 0) {
      html += ' <ul class="list-group" >';
      $.each(data.designations, function(i, designation) {
        html += ' <li class="list-group-item">' + designation.title + '</li>';
      });
      html += '</ul>';
    }



    $.each(data.names, function(i, taxon) {

      html += '<div class="panel panel-info">';

      if (taxon.preferred === 't') {
        html += '<div><small><strong>Preferred Name</strong></small></div>';
      }

      html += '<div class="panel-heading"> ';
      html += '<h4 class="panel-title" >' ;

      if (taxon.language_iso === 'lat') {
        taxon.taxon  = '<i>'+taxon.taxon+'</i>';
      }
      html += '<a class="btn btn-default" data-toggle="collapse" href="#taxon-panel-'+taxon.id+'" >'   ;
    
      html += taxon.taxon + '</a></h4>';

      if (taxon.id) {
        html += '<p><small><strong>Id:</strong> ' + taxon.id + '</small> </p>';
      }  

      html += '<p><strong>Updated:</strong> ' +
        taxon.updated_on +
        '</p>';
      
        if (taxon.name_form) {
        html += '<small>';
        switch (taxon.name_form) {
          case 'W':
             html += '<span class="badge">Well formed</span> ';
            break;
          case 'I':
             html += '<span class="badge">Informal</span> ';
            break;
          case 'U':
             html += '<span class="badge">Uncertain</span> ';            
            break;
          default:
             html += '<span class="badge"></span> ';            
            break;
        }
        html += '</small>';
      }

      html += '</div> <!-- panel header -->';
      
      html += '<div id="taxon-panel-'+taxon.id+'" class="panel-collapse collapse" >';
      html += '<div class="panel-body" >';

      if (taxon.rank) {
        html += '<p><strong>Rank</strong> ' + taxon.rank + '</p>';
      }

      if (taxon.organism_key) {
        html += '<p><strong>Organism key:</strong> ' + taxon.organism_key + '</p>';
      }      
      if (taxon.search_code) {
        html += '<p><strong>Search code:</strong> ' + taxon.search_code + '</p>';
      }
      if (taxon.external_key) {
        html += '<p><strong>External key:</strong> ' + taxon.external_key + '</p>';
      }
      if (taxon.authority) {
        html += '<p><strong>Authority:</strong> ' + taxon.authority + '</p>';
      }

      let nameType;

      if (taxon.preferred === 't' && taxon.language_iso === 'lat') {
        nameType = 'Accepted';
      } else if (taxon.language_iso === 'lat') {
        nameType = 'Synonym';
      } else {
        nameType = 'Vernacular';
      }

      html += '<p><strong>Type:</strong> ' + nameType + '</p>';

      html += '<p><strong>Preferred:</strong> ' +
        (taxon.preferred === 't' ? 'Yes' : 'No') +
        '</p>';

      html += '<p><strong>Name deprecated:</strong> ' +
        ((taxon.name_deprecated === 't') ? 'Yes' : 'No') +
        '</p>';

      html += '</div> <!-- panel body --> </div> <!-- taxon-panel-1 --></div> <!-- panel -->';
    });

    html += '</div><!-- col --><!-- row --></div> <!-- details -->';
    $('#taxon_details').html(html);

    if ( (data.occurrence_count>0) && (esEnabled))  {
      fetchOccurrences(meaningId);
    }

  }).fail(function(xhr, status, error) {

    $('#taxon_details').html(
      '<div class="alert alert-danger">' +
      'Failed to load taxon details.' +
      '</div>'
    );

    console.error(error);

  });

}

/**
 * Fetch taxon occurences.
 * ==================
 *
 * Fetch the taxon occurrences using elastic search
 * 
 *
 * @param {number} meaningId Taxon meaning identifier.
 * @returns {void}
 */

  function fetchOccurrences(taxonMeaningId) {
    var url = window.baseUrl +
      'index.php/taxontree_operation/fetchOccurrences/' + taxonMeaningId;

    $.ajax({
      url: url,
      method: 'GET',
      dataType: 'json',
      success: function(data) {
        //console.log(data);
      },
      error: function(xhr, status, error) {
        console.log('Status:', status);
        console.log('Error:', error);
        console.log(xhr.responseText);
      }
    });

  }


$(function() {
  loadTaxonLists();
  initialiseTaxonTree();
  initialiseTreeSearch();
  loadTaxonListInfo();
});

$('#taxon-list-select').on('change', function() {

  taxon_list_id = $(this).val();

  initialiseTaxonTree();
  loadTaxonListInfo();

});


$('#taxon-tree').on('click', '.jstree-anchor', function () {

  var node = $('#taxon-tree').jstree(true).get_node(this);

  loadTaxonDetails(
    node.original.meaning_id,
    taxon_list_id
  );
}); 

 $('#taxon-tree').on('select_node.jstree', function (e, data) {



});