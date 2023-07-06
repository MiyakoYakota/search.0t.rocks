# Zero Trust Search Engine

This repository contains all the code nessecary to create your own version of https://search.0t.rocks.


### Quickstart
To get your search engine running quickly on a single Linux host:
 1. Install Docker with Docker Compose
 2. Run `docker compose build; docker compose up`
 3. Run `bash start.sh`
 4. Visit `http://your-ip:3000`

### Converting Data
This is the hard part and completely up to you. You need to convert data into a standard format before it can be imported. See `sample.json` for the example data.

### Importing Data
Data imports are done using the SimplePostTool included with Solr. You can download a copy of the **binary release** [here](https://solr.apache.org/downloads.html), and import data with the following command after extracting Solr:
  `bin/post -c BigData -p 8983 -host <your host> path/to/your/file`

Docs are available here: https://solr.apache.org/guide/solr/latest/indexing-guide/post-tool.html

### Making Changes
If you make changes to code in the "dataapp" directory, you can re-build your app by re-running step 1 of Quickstart.

---

#### Considerations / Warnings
- Solr is very complex. If you intend on extending on the existing schema or indexing large quantities (billions) of documents, you will want to learn more about how it works.
- Keep backups, things will go wrong if you deviate the standard path.
- Don't be evil.
