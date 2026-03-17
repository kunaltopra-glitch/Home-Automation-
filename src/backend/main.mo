import OutCall "http-outcalls/outcall";
import Text "mo:core/Text";
import Runtime "mo:core/Runtime";

actor {
  public query func transform(input : OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(input);
  };

  public shared ({ caller }) func updateBlynkPin(pin : Text, value : Text) : async Text {
    let url = "https://blynk.cloud/external/api/update?token=fiFzCdYj4r_ec1JTCkEhFguHoVssls4o&" #
      pin #
      "=" #
      value;
    let response = await OutCall.httpGetRequest(url, [], transform);
    if (response == "200") {
      "ok";
    } else {
      Runtime.trap(response);
    };
  };
};
