# Installation Process
1. Check saved searches
	- customsearch_tac_get_deferred_amount_2.xml
	- customsearch_tac_get_unbilled_je_2.xml
	- customsearch_tac_get_unbilled_je.xml
2. Update account in criteria
	- customsearch_tac_get_deferred_amount_2.xml	-->	Deferred Revenue
	- customsearch_tac_get_unbilled_je_2.xml		-->	Unbilled Receivables
	- customsearch_tac_get_unbilled_je.xml			-->	Unbilled Receivables


After installing, go to Customization > Scripting > Script Deployments, open the "Deferred & Unbilled Revenue True-Up" Suitelet deployment, and set the Deferred Revenue Account and Unbilled Receivables Account parameters to the correct GL accounts for this subsidiary. Confirm the deployment audience includes the intended roles before use.


Purpose: Reconcile deferred revenue with unbilled receivables at project level
Description: This suitelet allows users to select a project and automatically
             creates a journal entry to true-up deferred revenue and unbilled
             receivables accounts based on current balances.

Logic Flow:
1. Display a form for project selection (GET request)
2. Fetch and display deferred amount details from saved search
3. Fetch and display unbilled receivables (debit/credit) from saved searches
4. Calculate net unbilled amount (debit - credit)
5. Create a journal entry if net amount is non-zero:
   - Debit: Deferred Revenue Account with net amount
   - Credit: Unbilled Receivables Account with net amount
6. Display results with tables and link to created journal entry
