import base64, hashlib, json, pathlib, urllib.request, urllib.error, uuid

root = pathlib.Path(__file__).resolve().parents[2] / 'instance'
base = 'http://127.0.0.1:8787/api'
image = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=')
digest = hashlib.sha256(image).hexdigest()

def opener(alias):
    from http.cookiejar import CookieJar
    client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    password = json.loads((root / f'cloud-local-{alias}-credential.json').read_text())['password']
    data = json.dumps({'alias':alias,'password':password}).encode()
    response = client.open(urllib.request.Request(base+'/session',data=data,headers={'Content-Type':'application/json'}))
    cookie = response.headers['Set-Cookie'].split(';',1)[0]
    answer = json.load(response)
    return client, answer['csrf'], cookie

def call(account, path, method='GET', body=None, csrf=None, mime='application/json'):
    client, _, cookie = account
    data = None if body is None else body if isinstance(body,bytes) else json.dumps(body).encode()
    headers = {'Content-Type':mime,'Cookie':cookie}
    if csrf: headers['X-CSRF-Token'] = csrf
    req = urllib.request.Request(base+path,data=data,headers=headers,method=method)
    try:
        response = client.open(req)
        return response.status, json.load(response)
    except urllib.error.HTTPError as exc:
        return exc.code, json.load(exc)

reporter = opener('test_observer')
reviewer = opener('test_reviewer')
other = opener('test_other')
reporter_csrf = reporter[1]
reviewer_csrf = reviewer[1]
report_id = str(uuid.uuid4())
declaration = {'digest':digest,'mime':'image/png','size':len(image)}
data = {'election_id':'SIM-2027','unit_id':'SIM-UNIT-'+uuid.uuid4().hex[:24].upper(),'state':'Niger','lga':'Paikoro','ward':'Tunganmallam/Nikuchi','accredited':10,'cast':8,'valid':8,'rejected':0,'party_votes':{'A':5,'B':3},'source_note':'test'}
for missing in ('state','lga','ward'):
    invalid = dict(data)
    invalid.pop(missing)
    status, _ = call(reporter,'/results','POST',{'report_id':str(uuid.uuid4()),'version':1,'data':invalid},reporter_csrf)
    assert status == 422, (missing,status)
for version in (1,2):
    status, answer = call(reporter,'/results','POST',{'report_id':report_id,'version':version,'data':data,'evidence':declaration},reporter_csrf)
    assert status == 200 and answer['receipt']['body']['version'] == version, (status,answer)
status, _ = call(reporter,'/results','POST',{'report_id':str(uuid.uuid4()),'version':1,'data':data},reporter_csrf)
assert status == 409, status
status, _ = call(reviewer,f'/review/{report_id}/decision','POST',{'version':2,'decision':'approved','note':'Test review'},reviewer_csrf)
assert status == 409, status
for version in (1,2):
    path=f'/results/{report_id}/evidence?version={version}'
    status, answer = call(reporter,path,'POST',image,reporter_csrf,'image/png')
    assert status == 200 and answer['digest'] == digest, (status,answer)
    status, answer = call(reporter,path+'&metadata=1')
    assert status == 200 and answer['stored'] and answer['digest'] == digest, (status,answer)
    status, answer = call(reporter,path,'POST',image,reporter_csrf,'image/png')
    assert status == 200 and answer['replayed'], (status,answer)
status, _ = call(other,f'/results/{report_id}/evidence?version=1&metadata=1')
assert status == 404, status
status, _ = call(other,f'/results/{report_id}/evidence?version=1','POST',image,other[1],'image/png')
assert status in (403,404), status
status, _ = call(reporter,f'/results/{report_id}/evidence?version=1','POST',image+b'x',reporter_csrf,'image/png')
assert status == 409, status
field_path=f'/review/{report_id}/fields?version=2'
status, answer = call(reviewer,field_path)
assert status == 200 and answer['actions'] == [], (status,answer)
status, _ = call(other,field_path)
assert status == 403, status
status, answer = call(reviewer,field_path,'POST',{'field_key':'party:A','outcome':'possible_mismatch','note':'Check printed figure'},reviewer_csrf)
assert status == 200 and answer['previous_event_id'] is None, (status,answer)
status, queue = call(reviewer,'/review')
current = next(item for item in queue['items'] if item['report_id'] == report_id)
assert status == 200 and current['comparison_count'] == 1 and current['comparison_mismatches'] == 1, (status,current)
status, answer = call(reviewer,field_path,'POST',{'field_key':'party:A','outcome':'matches','note':'Figure confirmed on image'},reviewer_csrf)
assert status == 200 and answer['previous_event_id'] is not None, (status,answer)
status, queue = call(reviewer,'/review')
current = next(item for item in queue['items'] if item['report_id'] == report_id)
assert status == 200 and current['comparison_count'] == 1 and current['comparison_mismatches'] == 0, (status,current)
status, answer = call(reviewer,field_path)
assert status == 200 and len(answer['actions']) == 2 and answer['actions'][1]['previous_event_id'] == answer['actions'][0]['id'], (status,answer)
status, answer = call(reviewer,f'/review/{report_id}/decision','POST',{'version':2,'decision':'approved','note':'Test review'},reviewer_csrf)
assert status == 200, (status,answer)
status, _ = call(reviewer,field_path,'POST',{'field_key':'cast','outcome':'matches','note':'Checked image'},reviewer_csrf)
assert status == 409, status
print('PASS: required location, unique unit code, receipt, prior-version upload, approval gate, metadata, replay, isolation, altered bytes, field history, final lock')
