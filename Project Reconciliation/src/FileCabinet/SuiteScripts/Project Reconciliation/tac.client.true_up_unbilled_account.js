/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/currentRecord'],
	/**
	 * @param{currentRecord} currentRecord
	 */
	function (currentRecord) {

		/**
		 * Function to be executed after page is initialized.
		 *
		 * @param {Object} context
		 * @param {Record} context.currentRecord - Current form record
		 * @param {string} context.mode - The mode in which the record is being accessed (create, copy, or edit)
		 *
		 * @since 2015.2
		 */
		function pageInit(context) {
			var curRec = context.currentRecord;
			// updateSelectedIds(curRec);
		}
		/**
		 * Function to be executed when field is changed.
		 *
		 * @param {Object} context
		 * @param {Record} context.currentRecord - Current form record
		 * @param {string} context.sublistId - Sublist name
		 * @param {string} context.fieldId - Field name
		 * @param {number} context.lineNum - Line number. Will be undefined if not a sublist or matrix field
		 * @param {number} context.columnNum - Line number. Will be undefined if not a matrix field
		 *
		 * @since 2015.2
		 */
		function fieldChanged(context) {
			var sublistId = context.sublistId;
			var fieldId = context.fieldId;
			var curRec = context.currentRecord;

			if (sublistId === 'custpage_projects_sublist' && fieldId === 'custpage_select') {
				updateSelectedIds(curRec);
			}
		}

		/**
		 * Rebuilds the semicolon-separated selected project IDs and writes to hidden fields.
		 */
		function updateSelectedIds(curRec) {
			try {
				var lineCount = curRec.getLineCount({ sublistId: 'custpage_projects_sublist' });
				var arr = [];
				for (var i = 0; i < lineCount; i++) {
					var isChecked = curRec.getSublistValue({ sublistId: 'custpage_projects_sublist', fieldId: 'custpage_select', line: i });
					if (isChecked === 'T' || isChecked === true || isChecked === 'true') {
						var projectId = curRec.getSublistValue({ sublistId: 'custpage_projects_sublist', fieldId: 'custpage_project_internalid', line: i });
						if (projectId && arr.indexOf(projectId) === -1) arr.push(projectId);
					}
				}
				var joined = arr.join(';');
				// write to both possible hidden field IDs for compatibility
				try { curRec.setValue({ fieldId: 'custpage_selected_project_ids', value: joined }); } catch (e) { }
				try { curRec.setValue({ fieldId: 'custpage_selected_project_id', value: joined }); } catch (e) { }
			} catch (err) {
				// ignore
			}
		}

		/**
		 * Checks every visible (non-filtered) sublist row and adds its project ID
		 * to custpage_selected_project_id.
		 */
		function markAll() {
			require(['N/currentRecord'], function(currentRecord) {
				var curRec = currentRecord.get();
				var lineCount = curRec.getLineCount({ sublistId: 'custpage_projects_sublist' });

				for (var i = 0; i < lineCount; i++) {
					if (!isRowVisible(i)) continue;

					curRec.selectLine({ sublistId: 'custpage_projects_sublist', line: i });
					curRec.setCurrentSublistValue({
						sublistId: 'custpage_projects_sublist',
						fieldId: 'custpage_select',
						value: true,
						ignoreFieldChange: true
					});
					curRec.commitLine({ sublistId: 'custpage_projects_sublist' });
				}

				updateSelectedIds(curRec);
			});
		}

		/**
		 * Unchecks every sublist row (visible or hidden) and clears custpage_selected_project_id.
		 */
		function unmarkAll() {
			require(['N/currentRecord'], function(currentRecord) {
				var curRec = currentRecord.get();
				var lineCount = curRec.getLineCount({ sublistId: 'custpage_projects_sublist' });

				for (var i = 0; i < lineCount; i++) {
					curRec.selectLine({ sublistId: 'custpage_projects_sublist', line: i });
					curRec.setCurrentSublistValue({
						sublistId: 'custpage_projects_sublist',
						fieldId: 'custpage_select',
						value: false,
						ignoreFieldChange: true
					});
					curRec.commitLine({ sublistId: 'custpage_projects_sublist' });
				}

				try { curRec.setValue({ fieldId: 'custpage_selected_project_id',  value: '' }); } catch (e) {}
				try { curRec.setValue({ fieldId: 'custpage_selected_project_ids', value: '' }); } catch (e) {}
			});
		}

		/**
		 * Returns true if the sublist DOM row at the given line index is currently visible.
		 * Used by markAll to skip rows hidden by the project filter.
		 */
		function isRowVisible(lineIndex) {
			var container = document.getElementById('custpage_projects_sublist')
				|| document.querySelector('[id*="custpage_projects_sublist"]');
			if (!container) return true;

			var table = (container.tagName === 'TABLE') ? container : container.querySelector('table');
			if (!table) return true;

			var rows = table.querySelectorAll('tbody tr');
			if (lineIndex < rows.length) {
				return rows[lineIndex].style.display !== 'none';
			}
			return true;
		}

		/**
		 * Function to be executed when field is slaved.
		 *
		 * @param {Object} context
		 * @param {Record} context.currentRecord - Current form record
		 * @param {string} context.sublistId - Sublist name
		 * @param {string} context.fieldId - Field name
		 *
		 * @since 2015.2
		 */
		function postSourcing(context) {

		}

		/**
		 * Function to be executed after sublist is inserted, removed, or edited.
		 *
		 * @param {Object} context
		 * @param {Record} context.currentRecord - Current form record
		 * @param {string} context.sublistId - Sublist name
		 *
		 * @since 2015.2
		 */
		function sublistChanged(context) {

		}

		/**
		 * Function to be executed after line is selected.
		 *
		 * @param {Object} context
		 * @param {Record} context.currentRecord - Current form record
		 * @param {string} context.sublistId - Sublist name
		 *
		 * @since 2015.2
		 */
		function lineInit(context) {

		}

		/**
		 * Validation function to be executed when field is changed.
		 *
		 * @param {Object} context
		 * @param {Record} context.currentRecord - Current form record
		 * @param {string} context.sublistId - Sublist name
		 * @param {string} context.fieldId - Field name
		 * @param {number} context.lineNum - Line number. Will be undefined if not a sublist or matrix field
		 * @param {number} context.columnNum - Line number. Will be undefined if not a matrix field
		 *
		 * @returns {boolean} Return true if field is valid
		 *
		 * @since 2015.2
		 */
		function validateField(context) {

		}

		/**
		 * Validation function to be executed when sublist line is committed.
		 *
		 * @param {Object} context
		 * @param {Record} context.currentRecord - Current form record
		 * @param {string} context.sublistId - Sublist name
		 *
		 * @returns {boolean} Return true if sublist line is valid
		 *
		 * @since 2015.2
		 */
		function validateLine(context) {

		}

		/**
		 * Validation function to be executed when sublist line is inserted.
		 *
		 * @param {Object} context
		 * @param {Record} context.currentRecord - Current form record
		 * @param {string} context.sublistId - Sublist name
		 *
		 * @returns {boolean} Return true if sublist line is valid
		 *
		 * @since 2015.2
		 */
		function validateInsert(context) {

		}

		/**
		 * Validation function to be executed when record is deleted.
		 *
		 * @param {Object} context
		 * @param {Record} context.currentRecord - Current form record
		 * @param {string} context.sublistId - Sublist name
		 *
		 * @returns {boolean} Return true if sublist line is valid
		 *
		 * @since 2015.2
		 */
		function validateDelete(context) {

		}

		/**
		 * Validation function to be executed when record is saved.
		 *
		 * @param {Object} context
		 * @param {Record} context.currentRecord - Current form record
		 * @returns {boolean} Return true if record is valid
		 *
		 * @since 2015.2
		 */
		function saveRecord(context) {
			var curRec = context.currentRecord;
			var selected = '';
			try {
				selected = curRec.getValue({ fieldId: 'custpage_selected_project_id' });
			} catch (e) {
				selected = '';
			}
			console.log('Selected project IDs on save:', selected);
			if (!selected || selected.trim() === '') {
				alert('Please select at least one project to run the True-Up.');
				return false;
			}
			return true;
		}

		function clearFilter() {
			var url = window.location.href.split('?')[0];
			var params = new URLSearchParams(window.location.search);
			params.delete('projectId');
			params.delete('filterCustomerId');
			window.location.href = url + '?' + params.toString();
		}

		function applyFilter() {
			require(['N/currentRecord'], function(currentRecord) {
				var curRec = currentRecord.get();
				var projectId = curRec.getValue({ fieldId: 'custpage_project_name_filter' });
				var filterCustomerId = curRec.getValue({ fieldId: 'custpage_customer_filter' });
				var url = window.location.href.split('?')[0];
				var params = new URLSearchParams(window.location.search);
				if (projectId) {
					params.set('projectId', projectId);
				} else {
					params.delete('projectId');
				}
				if (filterCustomerId) {
					params.set('filterCustomerId', filterCustomerId);
				} else {
					params.delete('filterCustomerId');
				}
				window.location.href = url + '?' + params.toString();
			});
		}

		return {
			pageInit: pageInit,
			fieldChanged: fieldChanged,
			markAll: markAll,
			unmarkAll: unmarkAll,
			applyFilter: applyFilter,
			clearFilter: clearFilter,
			saveRecord: saveRecord
		};

	});
