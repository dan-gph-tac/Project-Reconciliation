/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 * Purpose: Reconcile deferred revenue with unbilled receivables at project level
 * Description: This suitelet allows users to select a project and automatically
 *              creates a journal entry to true-up deferred revenue and unbilled
 *              receivables accounts based on current balances.
 *
 * Logic Flow:
 * 1. Display a form for project selection (GET request)
 * 2. Fetch and display deferred amount details from saved search
 * 3. Fetch and display unbilled receivables (debit/credit) from saved searches
 * 4. Calculate net unbilled amount (debit - credit)
 * 5. Create a journal entry if net amount is non-zero:
 *    - Debit: Deferred Revenue Account with net amount
 *    - Credit: Unbilled Receivables Account with net amount
 * 6. Display results with tables and link to created journal entry
 *
 * Account Configuration:
 * - DEFERRED_REVENUE_ACCOUNT_ID: Account to debit for true-up
 * - UNBILLED_RECEIVABLES_ACCOUNT_ID: Account to credit for true-up
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/log', 'N/runtime', 'N/url', 'N/format'],
function(ui, search, record, log, runtime, url, format) {

	// Global configuration variables, sourced from script deployment parameters.
	// Declared here (module scope) but only assigned inside onRequest, since
	// SuiteScript API modules are unavailable while the define() callback itself runs.
	var DEFERRED_REVENUE_ACCOUNT_ID;
	var UNBILLED_RECEIVABLES_ACCOUNT_ID;
	var SUITELET_URL;
	var BACK_BUTTON_HTML;

	function getNumericFilterValue(value) {
		if (value === null || value === undefined) {
			return '';
		}

		var normalizedValue = String(value).trim();
		return /^\d+$/.test(normalizedValue) ? normalizedValue : '';
	}

	function onRequest(context) {
        try {
			var currentScript = runtime.getCurrentScript();
            DEFERRED_REVENUE_ACCOUNT_ID = currentScript.getParameter({name: 'custscript_tac_deferred_rev_acct'});
            UNBILLED_RECEIVABLES_ACCOUNT_ID = currentScript.getParameter({name: 'custscript_tac_unbilled_rec_acct'});

            // Self URL, derived from the current script/deployment so it works in any NetSuite account
            SUITELET_URL = url.resolveScript({
                scriptId: currentScript.id,
                deploymentId: currentScript.deploymentId
            });
            BACK_BUTTON_HTML = '<div style="margin-top:10px;"><a href="' + SUITELET_URL + '" style="display:inline-block;padding:6px 12px;background:#0070d2;color:#fff;text-decoration:none;border-radius:4px;">Back</a></div>';

            // GET: Display form for project selection
			let projectId = getNumericFilterValue(context.request.parameters.projectId);
			let filterCustomerId = getNumericFilterValue(context.request.parameters.filterCustomerId);
			var formatter = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                });
            if (context.request.method === 'GET') {
                var form = ui.createForm({
                    title: 'Deferred & Unbilled Revenue True-Up'
                });

				// Hidden field to store selected project internal IDs for client script use
				let selectedProjectIdField = form.addField({
					id: 'custpage_selected_project_id',
					type: ui.FieldType.TEXT,
					label: 'Selected Project Internal ID'
				});
				selectedProjectIdField.updateDisplayType({displayType: ui.FieldDisplayType.HIDDEN});
				selectedProjectIdField.defaultValue = '';

                // Add sublist for project selection
                var projectSublist = form.addSublist({
                    id: 'custpage_projects_sublist',
                    type: ui.SublistType.LIST,
                    label: 'Projects'
                });

                projectSublist.addField({
                    id: 'custpage_select',
                    type: ui.FieldType.CHECKBOX,
                    label: 'Select'
                });

                projectSublist.addField({
                    id: 'custpage_project_name',
                    type: ui.FieldType.TEXT,
                    label: 'Project Name'
                }).updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});

                projectSublist.addField({
                    id: 'custpage_deferred_amount',
                    type: ui.FieldType.TEXT,
                    label: 'Total Deferred Amount'
                }).updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});

                projectSublist.addField({
                    id: 'custpage_unbilled_amount',
                    type: ui.FieldType.TEXT,
                    label: 'Current Unbilled'
                }).updateDisplayType({displayType: ui.FieldDisplayType.DISABLED});

                // Hidden field to store internal ID
                var internalIdField = projectSublist.addField({
                    id: 'custpage_project_internalid',
                    type: ui.FieldType.TEXT,
                    label: 'Internal ID'
                });
                internalIdField.updateDisplayType({displayType: ui.FieldDisplayType.HIDDEN});

                // Populate sublist with pre-filtered active projects that have unbilled amounts
                var projects = getActiveProjectsWithUnbilled(projectId, filterCustomerId);
                log.debug({
                    title: 'project length',
                    details: projects.length
                });

                for (var i = 0; i < projects.length; i++) {
                    var proj = projects[i];
                    projectSublist.setSublistValue({id: 'custpage_project_name', value: proj.name, line: i});
                    projectSublist.setSublistValue({id: 'custpage_deferred_amount', value: formatter.format(proj.deferredAmount), line: i});
                    projectSublist.setSublistValue({id: 'custpage_unbilled_amount', value: formatter.format(proj.unbilledAmount), line: i});
                    projectSublist.setSublistValue({id: 'custpage_project_internalid', value: proj.id, line: i});
                }

                form.addButton({ id: 'custpage_mark_all',   label: 'Mark All',   functionName: 'markAll'   });
                form.addButton({ id: 'custpage_unmark_all', label: 'Unmark All', functionName: 'unmarkAll' });
                form.addSubmitButton({ label: 'Run True-Up' });

				var jeDateGroup = form.addFieldGroup({
					id: 'custpage_je_date_group',
					label: 'Journal Entry Date'
				});

				var tranDateField = form.addField({
					id: 'custpage_tran_date',
					type: ui.FieldType.DATE,
					label: 'Transaction Date',
					container: 'custpage_je_date_group'
				});
				tranDateField.defaultValue = format.format({ value: new Date(), type: format.Type.DATE });

				// filter section for client script to read and apply filters on the sublist
				var filterGroup = form.addFieldGroup({
					id: 'custpage_filter_group',
					label: 'Filters'
				});

				var customerFld = form.addField({
					id: 'custpage_customer_filter',
					type: ui.FieldType.SELECT,
					label: 'Customer',
					container: 'custpage_filter_group'
				});
				customerFld.addSelectOption({ value: '', text: '--Select--', isSelected: true });
				var allCustomers = getCustomerIdsFromProjects(projects.map(function(p) { return p.id; }));
				allCustomers.forEach(function(customer) {
					customerFld.addSelectOption({ value: customer.id, text: customer.name });
				});
				if (filterCustomerId) {
					customerFld.defaultValue = filterCustomerId;
				}

				var projectNameFld = form.addField({
					id: 'custpage_project_name_filter',
					type: ui.FieldType.SELECT,
					label: 'Project Name Filter',
					container: 'custpage_filter_group'
				});
				projectNameFld.addSelectOption({ value: '', text: '--Select--', isSelected: true });
				projects.forEach(function(proj) {
					projectNameFld.addSelectOption({ value: proj.id, text: proj.name });
				});

				if (projectId) {
          			projectNameFld.defaultValue = projectId;
				}

				form.addButton({
					id: 'custpage_apply_filter',
					label: 'Apply Filter',
					functionName: 'applyFilter'
				});

				form.addButton({
					id: 'custpage_clear_filter',
					label: 'Clear Filter',
					functionName: 'clearFilter'
				});

                // Attach client script for validation and selection handling
                form.clientScriptModulePath = 'SuiteScripts/Project Reconciliation/tac.client.true_up_unbilled_account.js';

                context.response.writePage(form);
                return;
            }

            // POST: Process form submission
            if (context.request.method === 'POST') {
				var selectedProjects = [];

				// Get the selected project IDs from the hidden field and convert to array
				var tranDateStr = context.request.parameters.custpage_tran_date || '';
				var tranDate = tranDateStr ? format.parse({ value: tranDateStr, type: format.Type.DATE }) : new Date();
				var selectedProjectIdsString = context.request.parameters.custpage_selected_project_id || '';
				var projectIds = selectedProjectIdsString.split(';').filter(function(id) {
					return id.trim() !== '';
				});

				projectIds.forEach(function(projectId) {
					// create a lookup to get the project name for display purposes in the results page
					var project = getProjectById(projectId);
					selectedProjects.push({
						internalId: projectId.trim(),
						name: project ? project.name : projectId.trim()
					});
				});

                // Validate project selection
                if (selectedProjects.length === 0) {
                    var form = ui.createForm({
                        title: 'Deferred & Unbilled Revenue True-Up'
                    });
					form.addField({
						id: 'custpage_error',
						type: ui.FieldType.INLINEHTML,
						label: 'Notice'
					}).defaultValue = '<p style="color: red;"><strong>Error: Please select at least one project.</strong></p>';

					form.addField({
						id: 'custpage_back_html',
						type: ui.FieldType.INLINEHTML,
						label: 'Back'
					}).defaultValue = BACK_BUTTON_HTML;
                    context.response.writePage(form);
                    return;
                }

                // Create results form
                var resultForm = ui.createForm({
                    title: 'Deferred & Unbilled Revenue True-Up - Results'
                });

                // Build results table
				var resultsTableHtml = '<div><h2>Bulk True-Up Results</h2></div>';
                resultsTableHtml += '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">';
                resultsTableHtml += '<tr style="background-color: #e0e0e0;">';
                resultsTableHtml += '<th>Project</th>';
                resultsTableHtml += '<th style="text-align: right;">Total Deferred Amount</th>';
                resultsTableHtml += '<th style="text-align: right;">Total Unbilled Amount</th>';
                resultsTableHtml += '<th style="text-align: right;">Total Net Amount</th>';
                resultsTableHtml += '<th style="text-align: right;">Remaining Unbilled Amount</th>';
                resultsTableHtml += '<th>Journal Entry</th>';
                resultsTableHtml += '</tr>';

                var totalDeferredAll = 0;
                var totalUnbilledAll = 0;
                var totalNetAll = 0;
                var totalRemainingAll = 0;

				// Fetch totals for all selected projects up front (one run per search)
				// instead of per project, to stay within the governance limit
				var selectedIds = selectedProjects.map(function(p) { return p.internalId; });
				var unbilledTotals = getUnbilledTotalsByProject(selectedIds);
				var deferredTotals = getDeferredTotalsByProject(selectedIds);

                selectedProjects.forEach(function(project) {
					var unbilled = unbilledTotals[project.internalId] || { debit: 0, credit: 0 };
					var totalUnbilledAmount = unbilled.debit - unbilled.credit;
                    var totalCreditAmount = unbilled.credit;
                    var totalDeferredAmount = (deferredTotals[project.internalId] || 0) - totalCreditAmount;

                    // Net amount to true up is the deferred balance net of what's already
                    // been credited against it.
                    var totalNetAmount = 0;
					if (totalDeferredAmount !== 0 && totalUnbilledAmount !== 0 &&
                        (totalDeferredAmount > 0) === (totalUnbilledAmount > 0)) {
                        totalNetAmount = Math.abs(totalDeferredAmount) <= Math.abs(totalUnbilledAmount)
                            ? totalDeferredAmount
                            : totalUnbilledAmount;
                    }

                    // Create journal entry
                    var journalEntryId = null;
                    var jeLink = 'N/A';
                    if (totalNetAmount !== 0) {
                        journalEntryId = createTrueUpJournalEntry(project.internalId, totalNetAmount, tranDate);
                        if (journalEntryId) {
                            var journalEntryUrl = url.resolveRecord({
                                recordType: 'journalentry',
                                recordId: journalEntryId
                            });
                            jeLink = '<a href="' + journalEntryUrl + '" target="_blank">JE #' + journalEntryId + '</a>';
                        }
                    }

                    var remainingUnbilledAmount = totalUnbilledAmount - totalNetAmount;

                    resultsTableHtml += '<tr>';
                    resultsTableHtml += '<td>' + project.name + '</td>';
                    resultsTableHtml += '<td style="text-align: right;">' + formatter.format(totalDeferredAmount) + '</td>';
                    resultsTableHtml += '<td style="text-align: right;">' + formatter.format(totalUnbilledAmount) + '</td>';
                    resultsTableHtml += '<td style="text-align: right;">' + formatter.format(totalNetAmount) + '</td>';
                    resultsTableHtml += '<td style="text-align: right;">' + formatter.format(remainingUnbilledAmount) + '</td>';
                    resultsTableHtml += '<td>' + jeLink + '</td>';
                    resultsTableHtml += '</tr>';

                    totalDeferredAll += totalDeferredAmount;
                    totalUnbilledAll += totalUnbilledAmount;
                    totalNetAll += totalNetAmount;
                    totalRemainingAll += remainingUnbilledAmount;
                });

                // Add total row
                resultsTableHtml += '<tr style="background-color: #f0f0f0; font-weight: bold;">';
                resultsTableHtml += '<td>TOTAL</td>';
                resultsTableHtml += '<td style="text-align: right;">' + totalDeferredAll.toFixed(2) + '</td>';
                resultsTableHtml += '<td style="text-align: right;">' + totalUnbilledAll.toFixed(2) + '</td>';
                resultsTableHtml += '<td style="text-align: right;">' + totalNetAll.toFixed(2) + '</td>';
                resultsTableHtml += '<td style="text-align: right;">' + totalRemainingAll.toFixed(2) + '</td>';
                resultsTableHtml += '<td></td>';
                resultsTableHtml += '</tr>';

                resultsTableHtml += '</table>';
				resultsTableHtml += BACK_BUTTON_HTML;

                resultForm.addField({
                    id: 'custpage_results',
                    type: ui.FieldType.INLINEHTML,
                    label: 'Results'
                }).defaultValue = resultsTableHtml;

                context.response.writePage(resultForm);
                return;
            }

        } catch (e) {
            log.error('Error in True-Up Suitelet', e);
            context.response.write('Error: ' + e.message);
        }
    }

	function getCustomerIdsFromProjects(projectIds) {
		if (!projectIds || projectIds.length === 0) return [];
		var seen = {};
		var customers = [];
		search.create({
			type: 'job',
			filters: [['internalid', 'anyof', projectIds]],
			columns: [search.createColumn({ name: 'customer' })]
		}).run().each(function(result) {
			var customerId = result.getValue({ name: 'customer' });
			var customerName = result.getText({ name: 'customer' });
			if (customerId && !seen[customerId]) {
				seen[customerId] = true;
				customers.push({ id: customerId, name: customerName });
			}
			return true;
		});
		log.debug({ title: 'Customers from Projects', details: customers });
		return customers;
	}

	function getProjectById(projectId) {
		try {
			var fields = search.lookupFields({
				type: search.Type.JOB,
				id: projectId,
				columns: ['entityid', 'altname']
			});
			return {
				id: projectId,
				name: fields.altname || fields.entityid || projectId
			};
		} catch (error) {
			log.error('Error looking up project by ID', error.message);
			return null;
		}
	}

	/**
	 * Returns active, non-closed projects that have a non-zero net unbilled amount.
	 * Aggregates debit amounts from customsearch_tac_get_unbilled_je and credit amounts
	 * from customsearch_tac_get_unbilled_je_2, grouped by entity (project).
	 * Also fetches total deferred amount per qualifying project.
	 */
	function getActiveProjectsWithUnbilled(filterProjectId, filterCustomerId) {
		try {
			// Steps 1-2: Sum debit and credit amounts, grouped by entity
			var entityAmounts = getUnbilledTotalsByProject(filterProjectId ? [filterProjectId] : null);

			log.debug({
				title: 'entityAmounts',
				details: entityAmounts
			})

			// Step 3: Build a set of active, non-closed project IDs
			// Status text check excludes any status whose label contains "closed" (case-insensitive)
			var activeProjectIds = {};
			var jobFilters = [['isinactive', 'is', 'F']];
			if (filterCustomerId) {
				jobFilters.push('AND', ['customer', 'anyof', filterCustomerId]);
			} else {
				var projectCustomers = getCustomerIdsFromProjects(Object.keys(entityAmounts));
				if (projectCustomers.length > 0) {
					jobFilters.push('AND', ['customer', 'anyof', projectCustomers.map(function(c) { return c.id; })]);
				}
			}
			search.create({
				type: 'job',
				filters: jobFilters,
				columns: [
					search.createColumn({ name: 'internalid' }),
					search.createColumn({ name: 'status' }),
					search.createColumn({ name: 'customer' }),
				]
			}).run().each(function(result) {
				var statusText = (result.getText({ name: 'status' }) || '').toLowerCase();
				if (statusText.indexOf('closed') === -1) {
					activeProjectIds[result.getValue({ name: 'internalid' })] = {
						customerId: result.getValue({ name: 'customer' }),
						customerName: result.getText({ name: 'customer' })
					};
				}
				return true;
			});

			// Step 4: Filter to non-zero net amounts on active projects, fetch deferred amounts
			var candidateIds = Object.keys(entityAmounts).filter(function(entityId) {
				var data = entityAmounts[entityId];
				return (data.debit - data.credit) !== 0 && activeProjectIds[entityId];
			});
			var deferredTotals = getDeferredTotalsByProject(candidateIds);

			var results = [];
			candidateIds.forEach(function(entityId) {
				var data = entityAmounts[entityId];
				var deferredAmount = (deferredTotals[entityId] || 0) - data.credit;

				if (deferredAmount <= 0) {
					return;
				}

				results.push({
					id: data.id,
					name: data.name,
					deferredAmount: deferredAmount,
					unbilledAmount: data.debit - data.credit
				});
			});

			return results;

		} catch (error) {
			log.error('Error fetching active projects with unbilled:', error.message);
			return [];
		}
	}

	/**
	 * Returns deferred amount totals keyed by project internal ID, using a single
	 * run of customsearch_tac_get_deferred_amount_2 for all given projects.
	 */
	function getDeferredTotalsByProject(projectIds) {
		var totals = {};
		if (!projectIds || projectIds.length === 0) return totals;

		try {
			var savedSearch = search.load({
				id: 'customsearch_tac_get_deferred_amount_2'
			});

			savedSearch.filters.push(search.createFilter({
				name: 'internalid',
				join: 'job',
				operator: 'anyof',
				values: projectIds
			}));

			// Group by project so one run returns a total per project
			var projectColumn = search.createColumn({name: 'internalid', join: 'job', summary: 'GROUP'});
			savedSearch.columns = savedSearch.columns.concat([projectColumn]);

			savedSearch.run().each(function(result) {
				var projectId = result.getValue(projectColumn);
				var amount = parseFloat(result.getValue({name: "amount", summary: "SUM"})) || 0;
				if (projectId) {
					totals[projectId] = (totals[projectId] || 0) + amount;
				}
				return true;
			});

		} catch (error) {
			log.error('Error calculating deferred totals:', error.message);
		}

		return totals;
	}

	/**
	 * Returns { id, name, debit, credit } keyed by entity (project) internal ID.
	 * Debits come from customsearch_tac_get_unbilled_je and credits from
	 * customsearch_tac_get_unbilled_je_2. Pass projectIds to restrict to those projects.
	 */
	function getUnbilledTotalsByProject(projectIds) {
		var totals = {};

		accumulateUnbilledAmounts(totals, 'customsearch_tac_get_unbilled_je', projectIds, 'debit', function(result) {
			return parseFloat(result.getValue({ name: 'debitamount', summary: 'SUM' })) || 0;
		});

		accumulateUnbilledAmounts(totals, 'customsearch_tac_get_unbilled_je_2', projectIds, 'credit', function(result) {
			return Math.abs(parseFloat(result.getValue({ name: 'amount', summary: 'SUM' })) || 0);
		});

		return totals;
	}

	function accumulateUnbilledAmounts(totals, searchId, projectIds, amountKey, getAmount) {
		var unbilledSearch = search.load({ id: searchId });

		if (projectIds && projectIds.length > 0) {
			unbilledSearch.filters.push(search.createFilter({
				name: 'internalid',
				join: 'job',
				operator: 'anyof',
				values: projectIds
			}));
		}

		unbilledSearch.run().each(function(result) {
			// Skip rows whose entity is not a numeric internal ID
			var entityId = getNumericFilterValue(result.getValue({ name: 'formulatext', summary: 'GROUP', formula: 'TO_CHAR({entity.id})' }));

			if (entityId) {
				if (!totals[entityId]) {
					totals[entityId] = {
						id: entityId,
						name: result.getText({ name: 'entity', summary: 'GROUP' }),
						debit: 0,
						credit: 0
					};
				}
				totals[entityId][amountKey] += getAmount(result);
			}
			return true;
		});
	}

	function createTrueUpJournalEntry(projectId, netAmount, tranDate) {
		try {
			// lookupFields (1 unit) instead of record.load (5 units)
			var projectFields = search.lookupFields({
				type: search.Type.JOB,
				id: projectId,
				columns: ['entityid', 'subsidiary']
			});

			var projectName = projectFields.entityid || 'Project ' + projectId;
			var subsidiary = projectFields.subsidiary && projectFields.subsidiary.length ? projectFields.subsidiary[0].value : '';

			// Get class and department from invoice
			var department = '';
			var custClass = '';

			try {
				var invoiceSearch = search.create({
					type: 'invoice',
					filters: [['job', 'is', projectId]],
					columns: [
						search.createColumn({name: 'department'}),
						search.createColumn({name: 'class'})
					]
				});

				invoiceSearch.run().each(function(result) {
					if (!department) department = result.getValue({name: 'department'});
					if (!custClass) custClass = result.getValue({name: 'class'});
					return !department && !custClass; // Continue if both are empty
				});
			} catch (e) {
				log.debug('Invoice search failed, using empty values for class and department');
			}

			log.debug('Creating Journal Entry', 'Project: ' + projectId + ', Amount: ' + netAmount);

			var journalEntry = record.create({
				type: 'journalentry',
				isDynamic: true
			});

			journalEntry.setValue({
				fieldId: 'memo',
				value: 'Deferred Revenue True-Up - ' + projectName
			});

			if (tranDate) {
				journalEntry.setValue({ fieldId: 'trandate', value: tranDate });
			}

			if (subsidiary) {
				journalEntry.setValue({
					fieldId: 'subsidiary',
					value: subsidiary
				});
			}

			// Add debit line
			journalEntry.selectNewLine({sublistId: 'line'});
			journalEntry.setCurrentSublistValue({sublistId: 'line', fieldId: 'account', value: DEFERRED_REVENUE_ACCOUNT_ID});
			journalEntry.setCurrentSublistValue({sublistId: 'line', fieldId: 'debit', value: parseFloat(netAmount)});
			journalEntry.setCurrentSublistValue({sublistId: 'line', fieldId: 'memo', value: 'Deferred Revenue - ' + projectName});
			if (projectId) journalEntry.setCurrentSublistValue({sublistId: 'line', fieldId: 'entity', value: projectId});
			if (department) journalEntry.setCurrentSublistValue({sublistId: 'line', fieldId: 'department', value: department});
			if (custClass) journalEntry.setCurrentSublistValue({sublistId: 'line', fieldId: 'class', value: custClass});
			journalEntry.commitLine({sublistId: 'line'});

			// Add credit line
			journalEntry.selectNewLine({sublistId: 'line'});
			journalEntry.setCurrentSublistValue({sublistId: 'line', fieldId: 'account', value: UNBILLED_RECEIVABLES_ACCOUNT_ID});
			journalEntry.setCurrentSublistValue({sublistId: 'line', fieldId: 'credit', value: parseFloat(netAmount)});
			journalEntry.setCurrentSublistValue({sublistId: 'line', fieldId: 'memo', value: 'Unbilled Receivables - ' + projectName});
			if (projectId) journalEntry.setCurrentSublistValue({sublistId: 'line', fieldId: 'entity', value: projectId});
			if (department) journalEntry.setCurrentSublistValue({sublistId: 'line', fieldId: 'department', value: department});
			if (custClass) journalEntry.setCurrentSublistValue({sublistId: 'line', fieldId: 'class', value: custClass});
			journalEntry.commitLine({sublistId: 'line'});

			var journalEntryId = journalEntry.save();
			log.audit('Journal Entry Created', 'ID: ' + journalEntryId + ' for Project: ' + projectId);

			return journalEntryId;

		} catch (error) {
			log.error('Error creating journal entry', 'Message: ' + error.message);
			return null;
		}
	}

    return {
        onRequest: onRequest
    };
});
