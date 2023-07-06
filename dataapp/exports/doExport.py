import sys
import json
import base64
import requests
import random
import os
from mega import Mega

mega = Mega()


m = mega.login('email', 'password')
payload = json.loads(base64.b64decode(sys.argv[1]))

try:
    
    servers = ["http://solr1:8983/solr/BigData/select"]

    # If export count is a string convert to int
    if isinstance(payload['exportCount'], str):
        payload['exportCount'] = int(payload['exportCount'])

    print(f"Exporting {payload['exportCount']} records")

    if payload['exportCount'] < 1000:
        # Get random server
        server = random.choice(servers)

        print(f"Exporting {payload['exportCount']} from {server}: {payload['query']}")

        # Query the server for the data (payload.query)
        r = requests.get(server, params={
            'q': payload['query'],
            'rows': payload['exportCount'],
            'wt': 'csv'
        })

        print(r.text)

        print(f"Exported {len(r.text)} bytes")

        if len(r.text) == 0 or len(r.text) == 1:
            raise "bad length"

        # Write to payload['jobid].csv
        with open('exports/'+payload['jobid'] + '.csv', 'w') as f:
            f.write(r.text)

        print(f"Exported to {payload['jobid']}.csv")

        payload['status'] = "success"

        print(f"Uploading to mega.nz")

        # replace 'myfile.txt' with your file
        file = m.upload('exports/'+payload['jobid'] + '.csv')

        # Share the file so anyone with the link can view it
        print(f"Uploaded to mega.nz")

        # Get the link
        link = m.get_upload_link(file)

        print(f"Link: {link}")
        payload['status'] = "complete"
        payload['link'] = str(link)
        try:
            requests.post('http://127.0.0.1:3000/exports/callbacks/a-unique-id/exportCb', json=payload, timeout=5)
        # Timeout
        except:
            # Delete the file
            os.remove('exports/'+payload['jobid'] + '.csv')
            exit()

    else:
        # Create a folder for the jobid
        os.mkdir('exports/'+payload['jobid'])

        current = 0
        chunks = 1000

        while current < payload['exportCount']:
            print(f"Exporting chunk {current}/{payload['exportCount']}")
            # Get random server
            server = random.choice(servers)

            # Query the server for the data (payload.query)
            r = requests.get(server, params={
                'q': payload['query'],
                'rows': chunks,
                'start': current,
                'wt': 'csv'
            })

            # Write to payload['jobid].csv
            with open('exports/'+payload['jobid'] + '/' + str(current) + '.csv', 'w') as f:
                f.write(r.text)

            current += chunks

        # Zip the folder
        os.system(f"zip -r exports/{payload['jobid']}.zip exports/{payload['jobid']}")
        print(f"Exported to {payload['jobid']}.zip")

        # Upload to mega.nz
        file = m.upload('exports/'+payload['jobid'] + '.zip')

        # Share the file so anyone with the link can view it
        print(f"Uploaded to mega.nz")

        # Get the link
        link = m.get_upload_link(file)

        print(f"Link: {link}")
        payload['status'] = "complete"
        payload['link'] = str(link)
        try:
            requests.post('http://127.0.0.1:3000/exports/callbacks/a-unique-id/exportCb', json=payload, timeout=5)
        # Timeout
        except:
            # Delete the files
            os.remove('exports/'+payload['jobid'] + '.zip')
            os.system(f"rm -rf exports/{payload['jobid']}")
            exit()
except SystemExit:
    exit()
except:
    print("Unexpected error:", sys.exc_info()[0])
    payload['status'] = "failed"
    requests.post('http://127.0.0.1:3000/exports/callbacks/a-unique-id/exportCb', json=payload)
