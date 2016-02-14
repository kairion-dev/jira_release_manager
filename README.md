# Jira Release Manager

## Set up OAuth

1. Generate a key
   * `openssl genrsa -out ~/.ssh/jira_rsa 2048`
   * `openssl rsa -in ~/.ssh/jira_rsa -pubout > ~/.ssh/jira_rsa.pub`
2. Setup Application in Jira (Preferences > Add-ons > Select Application Links /plugins/servlet/applinks/listApplicationLinks)
   * Enable input link
   * Consumer Name: Jira Release Manager
   * Consumer key: Create one
   * Public: Use public key from created key
3. Add consumer key to config
4. Call `node oauth.js`. Get oauth verifier from the callback url
5. Add access key to config

## Open ideas / ToDos

* WebInterface to view all releases and tickets deployed
* Possibility to set release date to a tag
* Configuration of git repository location
* Multiple git repositories
* Show open branches
* Link open branches between repositories
* Update mechanism for fetched Tickets
* Webhook ability for JIRA to update Tickets directly
* Webhook ability for Bitbucket to create Tags directly
* Create release in JIRA and add release to all tickets in that release
* Move tickets to deployed, after release
* API call to set release date (e.g. add call to Jenkins deployment script)
* Add possibility to add "Manual Changes" section (maybe from commit message?)

### Kairion specific ideas / ToDos

* React on webhook calls (if we can do this generic, it can be added above)
  * Create tickets when Epic is set to Roadmap planning (Deployment, Code Review, Functional Review, RoadMap planning)
  * On time tracking set Ticket to in development (if it is on not planned/selected for development)
  * If Epic is set to "Selected for development" set all Tickets and Subtickets from "Not planned" to "Selected for Development"
* Show Swagger definitions for MS (if we can do this generic, it can be added above)

## Known issues

* Losing of tickets which were worked on in a feature branch before the release
