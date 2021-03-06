/* jshint node: true */
/* global describe,before,beforeEach,after,afterEach,it */

const request = require('request');
const supertest = require('supertest');
const sinon = require('sinon');
const fixtures = require('./fixtures/api');
const senateFixtures = require('./fixtures/senate');
const houseFixtures = require('./fixtures/house');

const VALID_RESPONSE = { statusCode: 200 };

let requests = {};

function stubRequest(url, body, error = false, response = VALID_RESPONSE) {
  requests[url] = [error, response, body];
}

describe('server', function() {
  before(function() {
    sinon.stub(request, 'get').callsFake(function(options, callback) {
      if (requests[options.url]) {
        callback(...requests[options.url]);
      } else {
        console.log(options.url);
        throw new Error(`No stubbed response defined for ${options.url}`);
      }
    });
  });
  beforeEach(function() {
    requests = {};
    process.env.PORT = 3001;
    this.server = require('../app/server');
  });

  afterEach(function() {
    this.server.close();
  });

  after(function() {
    request.get.restore();
  });

  describe('/api/district-from-address', function() {
    describe('with valid params', function() {
      const apiURL = 'https://geocoding.geo.census.gov/geocoder/geographies/address?benchmark=Public_AR_Current&vintage=Current_Current&format=json&layers=54&street=1600%20Pennsylvania%20Ave&zip=20500';
      const serverURL = '/api/district-from-address?street=1600%20Pennsylvania%20Ave&zip=20500';

      it('with successful API calls, returns correctly formatted response', function testSlash(done) {
        stubRequest(apiURL, fixtures.DISTRICT);

        supertest(this.server)
          .get(serverURL)
          .expect(200, fixtures.DISTRICT_RESPONSE, done);
      });

      it('returns correctly formatted response for address that in state with a single at-large district', function testSlash(done) {
        stubRequest(apiURL, fixtures.AT_LARGE_DISTRICT);

        supertest(this.server)
          .get(serverURL)
          .expect(200, fixtures.AT_LARGE_DISTRICT_RESPONSE, done);
      });

      it('returns correctly formatted response for address that in non-voting district', function testSlash(done) {
        stubRequest(apiURL, fixtures.NON_VOTING_DISTRICT);

        supertest(this.server)
          .get(serverURL)
          .expect(200, fixtures.NON_VOTING_DISTRICT_RESPONSE, done);
      });

      it('with failed API calls, returns correctly formatted error response', function testSlash(done) {
        stubRequest(apiURL, { message: 'failed with some error' }, true);

        supertest(this.server)
          .get(serverURL)
          .expect(500, { translationKey: 'UNKNOWN' }, done);
      });

      it('with invalid API calls, returns correctly formatted error response', function testSlash(done) {
        stubRequest(apiURL, 'unexpected successful response type');

        supertest(this.server)
          .get(serverURL)
          .expect(500, { translationKey: 'UNKNOWN' }, done);
      });

      describe('providing only zip code', function() {
        const apiURL = 'http://whoismyrepresentative.com/getall_mems.php?output=json&zip=20500';
        const serverURL = '/api/district-from-address?zip=20500';

        it('with successful API calls, returns correctly formatted response', function testSlash(done) {
          stubRequest(apiURL, fixtures.ZIP_ONLY_DISTRICT);

          supertest(this.server)
            .get(serverURL)
            .expect(200, fixtures.DISTRICT_RESPONSE, done);
        });

        it('returns correctly formatted response for zip that could be in multiple districts', function testSlash(done) {
          stubRequest(apiURL, fixtures.ZIP_ONLY_WITH_TWO_DISTRICTS);

          supertest(this.server)
            .get(serverURL)
            .expect(200, fixtures.TWO_DISTRICTS_RESPONSE, done);
        });

        it('returns correctly formatted response for zip in state with a single at-large district', function testSlash(done) {
          stubRequest(apiURL, fixtures.ZIP_ONLY_WITH_TWO_DISTRICTS);

          supertest(this.server)
            .get(serverURL)
            .expect(200, fixtures.TWO_DISTRICTS_RESPONSE, done);
        });

        it('with successful API calls, returns correctly formatted response with two districts', function testSlash(done) {
          stubRequest(apiURL, fixtures.ZIP_ONLY_WITH_AT_LARGE_DISTRICT);

          supertest(this.server)
            .get(serverURL)
            .expect(200, fixtures.AT_LARGE_DISTRICT_RESPONSE, done);
        });

        it('with failed API calls, returns correctly formatted error response', function testSlash(done) {
          stubRequest('http://whoismyrepresentative.com/getall_mems.php?output=json&zip=99999',
                      `<result message='No Data Found' />`);

          supertest(this.server)
            .get('/api/district-from-address?zip=99999')
            .expect(500, { translationKey: 'INVALID_ADDRESS' }, done);
        });

        it('with failed API calls, matching a non-voting district, returns correctly formatted response', function testSlash(done) {
          stubRequest(apiURL, `<result message='No Data Found' />`);

          supertest(this.server)
            .get(serverURL)
            .expect(200, fixtures.NON_VOTING_DISTRICT_RESPONSE, done);
        });
      });
    });

    describe('with invalid params', function() {
      it('with missing zip, returns correctly formatted error response', function testSlash(done) {
        supertest(this.server)
          .get('/api/district-from-address?street=1600%20%Pennsylvania%20Ave')
          .expect(400, { translationKey: 'MISSING_ZIP' }, done);
      });

      it('with no query params, returns correctly formatted error response', function testSlash(done) {
        supertest(this.server)
          .get('/api/district-from-address')
          .expect(400, { translationKey: 'MISSING_ZIP' }, done);
      });
    });
  });

  describe('/api/congress-from-district', function() {
    const validRepresentativeURL = 'https://api.propublica.org/congress/v1/115/house/members.json';
    const validSenatorURL = 'https://api.propublica.org/congress/v1/115/senate/members.json';
    const serverURL = '/api/congress-from-district?id=CA-12';

    describe('with valid params', function() {
      it('with successful API calls, returns correctly formatted response', function testSlash(done) {
        stubRequest(validRepresentativeURL, houseFixtures.REPRESENTATIVES);
        stubRequest(validSenatorURL, senateFixtures.SENATORS);

        supertest(this.server)
          .get(serverURL)
          .expect(200, fixtures.CONGRESS_RESPONSE, done);
      });

      it('with a state with an at-large district, returns correctly formatted response', function testSlash(done) {
        stubRequest(validRepresentativeURL, houseFixtures.REPRESENTATIVES);
        stubRequest(validSenatorURL, senateFixtures.SENATORS);

        supertest(this.server)
          .get('/api/congress-from-district?id=AK-0')
          .expect(200, fixtures.AT_LARGE_CONGRESS_RESPONSE, done);
      });

      it('with a non-voting state with an at-large district, returns correctly formatted response', function testSlash(done) {
        stubRequest(validRepresentativeURL, houseFixtures.REPRESENTATIVES);
        stubRequest(validSenatorURL, senateFixtures.SENATORS);

        supertest(this.server)
          .get('/api/congress-from-district?id=PR-0')
          .expect(200, fixtures.NON_VOTING_AT_LARGE_CONGRESS_RESPONSE, done);
      });

      it('with failed API calls, returns correctly formatted error response', function testSlash(done) {
        stubRequest(validRepresentativeURL, { message: 'failed with some error' }, true);
        stubRequest(validSenatorURL, { message: 'another error' }, true);

        supertest(this.server)
          .get(serverURL)
          .expect(500, { translationKey: 'UNKNOWN' }, done);
      });

      it('with invalid API calls, returns correctly formatted error response', function testSlash(done) {
        stubRequest(validRepresentativeURL, 'unexpected successful response type');
        stubRequest(validSenatorURL, 'unexpected error response type', true);

        supertest(this.server)
          .get(serverURL)
          .expect(500, { translationKey: 'UNKNOWN' }, done);
      });
    });

    describe('with invalid params', function() {
      it('with random string for id, returns correctly formatted error response', function testSlash(done) {
        supertest(this.server)
          .get('/api/congress-from-district?id=not-a-valid-id')
          .expect(400, { translationKey: 'INVALID_DISTRICT_ID' }, done);
      });

      it('with invalid state, returns correctly formatted error response', function testSlash(done) {
        supertest(this.server)
          .get('/api/congress-from-district?id=LOL-12')
          .expect(400, { translationKey: 'INVALID_DISTRICT_ID' }, done);
      });

      it('with no query params, returns correctly formatted error response', function testSlash(done) {
        supertest(this.server)
          .get('/api/congress-from-district')
          .expect(400, { translationKey: 'MISSING_DISTRICT_ID' }, done);
      });
    });
  });
});