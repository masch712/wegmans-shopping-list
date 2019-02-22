export class LoggedEvent {
  private logObj: any;
  constructor(public type: string) {
    this.logObj = {};
    this.addProperty('type', type);
  }

  addProperty(key: string, value: any) {
    this.logObj[key] = value;
    return this;
  }

  toString() {
    return JSON.stringify(this.logObj);
  }
}